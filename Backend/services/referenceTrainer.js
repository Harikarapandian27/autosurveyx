const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const extractor = require('./extractor');

class ReferenceTrainer {
  /**
   * Train and analyze a reference model document
   * @param {string} filePath Absolute or relative path to reference file
   * @param {string} originalName Original filename
   * @returns {Promise<Object>} Comprehensive reference training profile
   */
  async trainFromReference(filePath, originalName) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Reference file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    let rawText = '';
    let docxXml = '';
    let hasTabsInXml = false;
    let singleTabDetected = false;

    // 1. Extract text and XML if docx
    if (ext === '.docx') {
      try {
        const fileBuf = fs.readFileSync(filePath);
        const zip = new PizZip(fileBuf);
        const docXmlFile = zip.file('word/document.xml');
        if (docXmlFile) {
          docxXml = docXmlFile.asText();
          // Count <w:tab/> occurrences
          const tabMatches = docxXml.match(/<w:tab\b[^>]*\/>/g) || [];
          hasTabsInXml = tabMatches.length > 5;
          // Check for single tab spacing patterns like <w:tab/><w:t>:</w:t> or <w:t>:</w:t><w:tab/>
          const singleTabPatterns = [
            /<w:tab\b[^>]*\/>\s*<w:t\b[^>]*>[:\-]/,
            /[:\-]\s*<\/w:t>\s*<\/w:r>\s*<w:r\b[^>]*>\s*<w:tab\b[^>]*\/>/,
            /<w:tab\b[^>]*\/>(?!\s*<w:tab)/
          ];
          singleTabDetected = singleTabPatterns.some(p => p.test(docxXml)) || hasTabsInXml;
        }
      } catch (err) {
        console.warn('Docx XML inspection warning:', err.message);
      }
    }

    // Extract text content
    const extractionResult = await extractor.extractText(filePath, ext);
    rawText = extractionResult.text || '';

    // If text has \t characters
    const textTabMatches = rawText.match(/\t/g) || [];
    if (textTabMatches.length > 5) {
      singleTabDetected = true;
    }

    // 2. Analyze Alignment Profile
    const alignmentProfile = this._analyzeAlignment(rawText, docxXml, singleTabDetected, hasTabsInXml);

    // 3. Identify Required Source Documents ("How to upload / What docs to upload")
    const requiredDocuments = this._analyzeRequiredDocuments(rawText);

    // 4. Identify Target Fields & Locations ("What datas to upload & Where to upload")
    const { fields, sections, totalMappedFields } = this._analyzeFieldsAndSections(rawText, docxXml);

    return {
      fileName: originalName || path.basename(filePath),
      fileExt: ext,
      fileSize: fs.statSync(filePath).size,
      trainedAt: new Date().toISOString(),
      alignment: alignmentProfile,
      requiredDocuments,
      sections,
      fields,
      totalMappedFields,
      summary: {
        docRequirementsCount: requiredDocuments.length,
        fieldsDetectedCount: totalMappedFields,
        alignmentMode: alignmentProfile.type,
        alignmentLabel: alignmentProfile.label,
        status: 'TRAINED_ACTIVE'
      }
    };
  }

  _analyzeAlignment(rawText, docxXml, singleTabDetected, hasTabsInXml) {
    // Detect colon usage
    const colonCount = (rawText.match(/:\s*/g) || []).length;
    const hasColons = colonCount > 8;

    // Detect if lines typically have single tab space before or after colon
    let alignmentType = 'single_tab_space';
    let alignmentLabel = 'Single Tab Space Alignment';
    let description = 'Detected single tab space ([Label] → [TAB] → : → [Value]) preserving standard surveyor indent and fixed colon position.';

    if (singleTabDetected || hasTabsInXml) {
      alignmentType = 'single_tab_space';
      alignmentLabel = 'Single Tab Space (<w:tab/>) Enforced';
      description = 'Reference document strictly enforces a single tab space between field labels, colon delimiters, and values without table clipping.';
    } else if (hasColons) {
      alignmentType = 'colon_aligned_spacing';
      alignmentLabel = 'Colon-Aligned Tab Spacing';
      description = 'Reference document utilizes structured colon separators; single tab spacing will be applied for clean horizontal alignment.';
    }

    return {
      type: alignmentType,
      label: alignmentLabel,
      description,
      tabStop: '0.5 in (Single Tab)',
      hasTabs: singleTabDetected || hasTabsInXml,
      hasColons,
      colonCount
    };
  }

  _analyzeRequiredDocuments(text) {
    const t = text.toUpperCase();
    const docs = [];

    // RC Book check
    if (t.includes('REGISTRATION') || t.includes('REGN') || t.includes('CHASSIS') || t.includes('ENGINE NO') || t.includes('MAKER') || t.includes('CUBIC CAPACITY') || t.includes('CLASS OF VEHICLE')) {
      docs.push({
        id: 'req_rc',
        docType: 'RC_BOOK',
        title: 'Registration Certificate (RC Book)',
        priority: 'CRITICAL',
        description: 'Supplies Vehicle Reg No, Chassis/VIN, Engine No, Make & Model, Seating Capacity, Fuel, Manufacturing Year',
        icon: 'RC',
        fieldsSupplied: ['vehicle_reg_no', 'chassis_no', 'engine_no', 'make_model', 'manufacturing_year', 'seating_capacity', 'fuel_type', 'cubic_capacity']
      });
    }

    // Driving License check
    if (t.includes('DRIVING') || t.includes('LICENCE') || t.includes('LICENSE') || t.includes('D/L') || t.includes('DRIVER') || t.includes('BADGE')) {
      docs.push({
        id: 'req_dl',
        docType: 'DRIVING_LICENSE',
        title: 'Driving Licence (DL)',
        priority: 'CRITICAL',
        description: 'Supplies Driver Name, DL Number, DL Validity, Licensing Authority, and Class of Vehicle Allowed',
        icon: 'DL',
        fieldsSupplied: ['driver_name', 'dl_no', 'dl_validity', 'dl_type', 'dl_issued_by']
      });
    }

    // Insurance Policy check
    if (t.includes('INSURANCE') || t.includes('POLICY') || t.includes('IDV') || t.includes('INSURED') || t.includes('SUM INSURED') || t.includes('COVER NOTE')) {
      docs.push({
        id: 'req_policy',
        docType: 'INSURANCE_POLICY',
        title: 'Insurance Policy Schedule / Cover Note',
        priority: 'CRITICAL',
        description: 'Supplies Policy Number, Insuring Company, Insured Name & Address, IDV Value, Policy Period',
        icon: 'POL',
        fieldsSupplied: ['policy_no', 'insurance_company', 'owner_name', 'owner_address', 'idv_amount', 'policy_period']
      });
    }

    // Repair Estimate / Bill
    if (t.includes('ESTIMATE') || t.includes('LABOUR') || t.includes('REPAIR') || t.includes('PARTS') || t.includes('WORKSHOP') || t.includes('ASSESSMENT')) {
      docs.push({
        id: 'req_estimate',
        docType: 'REPAIR_ESTIMATE',
        title: 'Repairer Estimate / Work Order',
        priority: 'RECOMMENDED',
        description: 'Supplies Workshop Name, Estimated Parts List, Labour Charges, Contact Details',
        icon: 'EST',
        fieldsSupplied: ['workshop_contact', 'damage_summary']
      });
    }

    // Damage Inspection Photos
    if (t.includes('PHOTO') || t.includes('DAMAGE') || t.includes('SPOT') || t.includes('FRONT') || t.includes('IMPACT')) {
      docs.push({
        id: 'req_photos',
        docType: 'DAMAGE_PHOTO',
        title: 'Inspection & Damage Photos',
        priority: 'RECOMMENDED',
        description: 'Supplies Visual Proof of Damage, Odometer Reading snapshot, Impact Point verification',
        icon: 'IMG',
        fieldsSupplied: ['odometer_reading', 'damage_summary']
      });
    }

    // FIR / Police Intimation
    if (t.includes('F.I.R') || t.includes('FIR') || t.includes('POLICE') || t.includes('STATION')) {
      docs.push({
        id: 'req_fir',
        docType: 'POLICE_FIR',
        title: 'Police Intimation / FIR / Damaged Certificate',
        priority: 'OPTIONAL',
        description: 'Supplies FIR Number, Police Station Details, Date & Time of Occurrence record',
        icon: 'FIR',
        fieldsSupplied: ['fir_details', 'accident_date_time', 'accident_place']
      });
    }

    // Default fallback if minimal text
    if (docs.length === 0) {
      docs.push(
        { id: 'req_rc', docType: 'RC_BOOK', title: 'Registration Certificate (RC)', priority: 'CRITICAL', description: 'Vehicle identity particulars', icon: 'RC', fieldsSupplied: ['vehicle_reg_no'] },
        { id: 'req_dl', docType: 'DRIVING_LICENSE', title: 'Driving Licence (DL)', priority: 'CRITICAL', description: 'Driver particulars', icon: 'DL', fieldsSupplied: ['driver_name'] },
        { id: 'req_policy', docType: 'INSURANCE_POLICY', title: 'Insurance Policy Schedule', priority: 'CRITICAL', description: 'Coverage particulars', icon: 'POL', fieldsSupplied: ['policy_no'] }
      );
    }

    return docs;
  }

  _analyzeFieldsAndSections(text, docxXml) {
    const t = (text + ' ' + (docxXml ? docxXml.replace(/<[^>]+>/g, ' ') : '')).toUpperCase();

    const sections = [
      {
        id: 'sec_policy',
        name: '1. Policy & Insured Particulars',
        description: 'Insurance coverage details, insured identity, IDV, and policy period',
        fields: []
      },
      {
        id: 'sec_vehicle',
        name: '2. Vehicle Particulars',
        description: 'Registration, chassis, engine, manufacturing year, class, and specifications',
        fields: []
      },
      {
        id: 'sec_driver',
        name: '3. Driver Particulars',
        description: 'Driver name, driving licence number, validity date, and vehicle class authorized',
        fields: []
      },
      {
        id: 'sec_accident',
        name: '4. Accident & Survey Particulars',
        description: 'Date, time, location of accident and physical survey inspection place',
        fields: []
      },
      {
        id: 'sec_surveyor',
        name: '5. Surveyor Sign-off Particulars',
        description: 'Attending surveyor name, IRDA license, case reference number',
        fields: []
      }
    ];

    const fieldDefinitions = [
      // Policy
      { key: 'policy_no', label: 'Policy Number', sectionId: 'sec_policy', patterns: [/POLICY\s*(?:NO|NUMBER)/i, /COVER\s*NOTE/i] },
      { key: 'claim_no', label: 'Claim Number', sectionId: 'sec_policy', patterns: [/CLAIM\s*(?:NO|NUMBER)/i, /LOSS\s*NO/i] },
      { key: 'insurance_company', label: 'Insuring Company', sectionId: 'sec_policy', patterns: [/INSURANCE\s*COMPANY/i, /INSURER/i, /ASSURANCE/i] },
      { key: 'owner_name', label: 'Insured / Owner Name', sectionId: 'sec_policy', patterns: [/NAME\s*OF\s*(?:THE\s*)?INSURED/i, /INSURED\s*NAME/i, /OWNER\s*NAME/i] },
      { key: 'owner_address', label: 'Insured Address', sectionId: 'sec_policy', patterns: [/INSURED\s*ADDRESS/i, /ADDRESS\s*OF\s*(?:THE\s*)?INSURED/i] },
      { key: 'policy_period', label: 'Policy Period / Validity', sectionId: 'sec_policy', patterns: [/PERIOD\s*OF\s*INSURANCE/i, /POLICY\s*PERIOD/i] },
      { key: 'idv_amount', label: 'IDV (Insured Declared Value)', sectionId: 'sec_policy', patterns: [/IDV/i, /INSURED\s*DECLARED\s*VALUE/i, /SUM\s*INSURED/i] },
      { key: 'finance', label: 'Hypothecation / Financier', sectionId: 'sec_policy', patterns: [/H\.?P\.?A/i, /FINANCE/i, /HYPOTHECATION/i] },

      // Vehicle
      { key: 'vehicle_reg_no', label: 'Registration Number', sectionId: 'sec_vehicle', patterns: [/REG(?:ISTRATION|N)?\.?\s*(?:NO|NUMBER)/i] },
      { key: 'registration_date', label: 'Date of Registration', sectionId: 'sec_vehicle', patterns: [/DATE\s*OF\s*REG(?:ISTRATION|N)?/i] },
      { key: 'make_model', label: 'Make & Model', sectionId: 'sec_vehicle', patterns: [/MAKE/i, /MODEL/i, /MAKER/i] },
      { key: 'chassis_no', label: 'Chassis Number (VIN)', sectionId: 'sec_vehicle', patterns: [/CHASSIS\s*(?:NO|NUMBER)?/i, /VIN/i] },
      { key: 'engine_no', label: 'Engine Number', sectionId: 'sec_vehicle', patterns: [/ENGINE\s*(?:NO|NUMBER)?/i, /MOTOR\s*NO/i] },
      { key: 'manufacturing_year', label: 'Manufacturing Year', sectionId: 'sec_vehicle', patterns: [/MFG\.?\s*YEAR/i, /YEAR\s*OF\s*(?:MFG|MANUFACTURE)/i] },
      { key: 'vehicle_class', label: 'Class of Vehicle', sectionId: 'sec_vehicle', patterns: [/CLASS\s*OF\s*VEHICLE/i, /VEHICLE\s*CLASS/i] },
      { key: 'fuel_type', label: 'Fuel Type', sectionId: 'sec_vehicle', patterns: [/FUEL\s*TYPE/i, /TYPE\s*OF\s*FUEL/i] },
      { key: 'seating_capacity', label: 'Seating Capacity', sectionId: 'sec_vehicle', patterns: [/SEATING\s*CAPACITY/i, /SEATS/i] },
      { key: 'cubic_capacity', label: 'Cubic Capacity (CC)', sectionId: 'sec_vehicle', patterns: [/CUBIC\s*CAPACITY/i, /CC/i] },
      { key: 'odometer_reading', label: 'Odometer Reading', sectionId: 'sec_vehicle', patterns: [/ODOMETER/i, /SPEEDO/i, /KM\s*READING/i] },
      { key: 'color', label: 'Vehicle Color', sectionId: 'sec_vehicle', patterns: [/COLOU?R/i] },

      // Driver
      { key: 'driver_name', label: "Driver's Name", sectionId: 'sec_driver', patterns: [/DRIVER(?:\'S)?\s*NAME/i, /NAME\s*OF\s*(?:THE\s*)?DRIVER/i] },
      { key: 'dl_no', label: 'Driving Licence No.', sectionId: 'sec_driver', patterns: [/D\/?L\s*(?:NO|NUMBER)/i, /DRIVING\s*LICEN[SC]E/i] },
      { key: 'dl_validity', label: 'DL Valid Upto', sectionId: 'sec_driver', patterns: [/VALID\s*UP\s*TO/i, /DL\s*VALIDITY/i, /VALID\s*UPTO/i] },
      { key: 'dl_type', label: 'Type of Licence / Class Allowed', sectionId: 'sec_driver', patterns: [/TYPE\s*OF\s*LICEN[SC]E/i, /CLASS\s*ALLOWED/i] },
      { key: 'driver_relation', label: 'Relation with Insured', sectionId: 'sec_driver', patterns: [/RELATION(?:SHIP)?\s*WITH\s*INSURED/i] },

      // Accident
      { key: 'accident_date_time', label: 'Accident Date & Time', sectionId: 'sec_accident', patterns: [/DATE\s*(?:&|AND)?\s*TIME\s*OF\s*ACCIDENT/i, /ACCIDENT\s*DATE/i] },
      { key: 'accident_place', label: 'Place of Accident', sectionId: 'sec_accident', patterns: [/PLACE\s*OF\s*ACCIDENT/i, /ACCIDENT\s*PLACE/i] },
      { key: 'survey_place', label: 'Place of Survey / Inspection', sectionId: 'sec_accident', patterns: [/PLACE\s*OF\s*SURVEY/i, /INSPECTION\s*PLACE/i] },
      { key: 'survey_date', label: 'Survey Date', sectionId: 'sec_accident', patterns: [/SURVEY\s*DATE/i, /DATE\s*OF\s*SURVEY/i] },
      { key: 'fir_details', label: 'Police FIR Number', sectionId: 'sec_accident', patterns: [/F\.?I\.?R/i, /POLICE\s*REPORT/i] },
      { key: 'damage_summary', label: 'Damage Summary', sectionId: 'sec_accident', patterns: [/DAMAGE\s*SUMMARY/i, /DAMAGES\s*OBSERVED/i, /PARTICULARS\s*OF\s*DAMAGE/i] },

      // Surveyor
      { key: 'surveyor_name', label: 'Surveyor / Loss Assessor Name', sectionId: 'sec_surveyor', patterns: [/SURVEYOR(?:\'S)?\s*NAME/i, /INSPECTED\s*BY/i, /ASSESSOR/i] },
      { key: 'surveyor_license', label: 'IRDA License Number', sectionId: 'sec_surveyor', patterns: [/IRDA/i, /SURVEYOR\s*LICEN[SC]E/i] },
      { key: 'case_number', label: 'Report Ref / Case Number', sectionId: 'sec_surveyor', patterns: [/REPORT\s*REF/i, /CASE\s*NO/i, /SURVEY\s*REF/i] }
    ];

    const detectedFields = [];
    for (const def of fieldDefinitions) {
      const isPresent = def.patterns.some(p => p.test(t));
      // Mark as detected
      const fieldObj = {
        key: def.key,
        label: def.label,
        sectionId: def.sectionId,
        detectedInReference: isPresent,
        alignment: 'single_tab_space'
      };
      detectedFields.push(fieldObj);

      const targetSec = sections.find(s => s.id === def.sectionId);
      if (targetSec && isPresent) {
        targetSec.fields.push(fieldObj);
      }
    }

    return {
      fields: detectedFields,
      sections: sections.filter(s => s.fields.length > 0),
      totalMappedFields: detectedFields.filter(f => f.detectedInReference).length
    };
  }
}

module.exports = new ReferenceTrainer();
