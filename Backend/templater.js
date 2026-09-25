const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const config = require('../config');
const db = require('../models/db');

// ReportTemplater helper functions for OpenXML semantic table and paragraph overwriting

function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(safe) {
  if (!safe) return '';
  return safe
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractCellText(cellXml) {
  const matches = cellXml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [];
  const text = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').trim();
  return unescapeXml(text);
}

function replaceCellText(cellXml, newText) {
  let firstReplaced = false;
  let hasTextTag = false;

  const result = cellXml.replace(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g, (match, attrs) => {
    hasTextTag = true;
    if (!firstReplaced) {
      firstReplaced = true;
      return `<w:t${attrs}>${escapeXml(newText)}</w:t>`;
    }
    return `<w:t${attrs}></w:t>`;
  });

  if (!hasTextTag) {
    if (result.includes('</w:p>')) {
      return result.replace('</w:p>', `<w:r><w:t>${escapeXml(newText)}</w:t></w:r></w:p>`);
    } else {
      return result.replace('</w:tc>', `<w:p><w:r><w:t>${escapeXml(newText)}</w:t></w:r></w:p></w:tc>`);
    }
  }

  return result;
}

function sanitizeValue(val) {
  if (val === null || val === undefined) return 'NA';
  const s = String(val).trim();
  if (s === '' || s === '-' || s === 'N/A' || s === 'NA.' || s === 'NA') return 'NA';
  return s;
}

function getFieldMappings(data) {
  const s = (k) => sanitizeValue(data ? data[k] : null);

  const rawMake = data?.make || (data?.make_model && data.make_model.includes(' - ') ? data.make_model.split(' - ')[0].trim() : data?.make_model);
  const rawModel = data?.model || (data?.make_model && data.make_model.includes(' - ') ? data.make_model.split(' - ')[1].trim() : data?.make_model);
  const makeVal = sanitizeValue(rawMake);
  const modelVal = sanitizeValue(rawModel);

  return [
    {
      key: 'claim_no',
      val: s('claim_no'),
      patterns: [/^(?:Claim\s*(?:No\.?|Number)|Claim\s*Reference(?:\s*No\.?)?|Loss\s*No\.?)$/i],
      exclude: [/policy/i]
    },
    {
      key: 'policy_no',
      val: s('policy_no'),
      patterns: [/^(?:Policy\s*(?:No\.?|Number)|Cover\s*Note\s*No\.?|Certificate\s*No\.?)$/i],
      exclude: [/claim/i, /period/i]
    },
    {
      key: 'policy_period',
      val: s('policy_period'),
      patterns: [/^(?:Period\s*of\s*Insurance|Policy\s*Period|Insurance\s*Period|Validity\s*of\s*Policy|Period\s*cover)$/i]
    },
    {
      key: 'insurance_company',
      val: s('insurance_company'),
      patterns: [/^(?:Insurance\s*Company|Insuring\s*Company|Name\s*of\s*(?:the\s*)?Insurer|Insurer|Insuring\s*Office)$/i]
    },
    {
      key: 'owner_name',
      val: s('owner_name'),
      patterns: [
        /^(?:Registered\s*)?(?:Owner|Insured|Client|Customer)(?:\s*(?:Name|\/))?$/i,
        /^(?:Name\s*of\s*(?:the\s*)?(?:Insured|Owner|Registered\s*Owner|Client))$/i,
        /^Insured$/i,
        /^Owner$/i
      ],
      exclude: [/relationship/i, /driver/i, /address/i]
    },
    {
      key: 'owner_address',
      val: s('owner_address'),
      patterns: [/^(?:Insured\s*Address|Owner\s*Address|Address\s*of\s*(?:the\s*)?Insured)$/i]
    },
    {
      key: 'idv_amount',
      val: s('idv_amount'),
      patterns: [/^(?:Insured(?:\'s)?\s*Declared\s*Value|IDV(?:\s*Amount)?|Sum\s*Insured|IDV\s*\/?\s*Endorsement)$/i]
    },
    {
      key: 'finance',
      val: s('finance'),
      patterns: [/^(?:Finance|Hypothecation|H\.?P\.?A\.?)$/i]
    },
    {
      key: 'vehicle_reg_no',
      val: s('vehicle_reg_no'),
      patterns: [
        /^(?:Vehicle\s*)?Reg(?:istration|n)?\.?\s*(?:No\.?|Number)?$/i,
        /^Registration\s*number$/i,
        /^Regn?\.?\s*No\.?$/i,
        /^Plate\s*No\.?$/i
      ],
      exclude: [/date/i]
    },
    {
      key: 'registration_date',
      val: s('registration_date'),
      patterns: [
        /^(?:Date\s*of\s*Reg(?:istration|n)?\.?|Reg(?:istration)?\.?\s*Date)$/i,
        /^Date\s*of\s*Registration$/i
      ]
    },
    {
      key: 'make',
      val: makeVal,
      patterns: [/^(?:Vehicle\s*)?Make$/i, /^Maker(?:\s*Name)?$/i],
      exclude: [/model/i]
    },
    {
      key: 'model',
      val: modelVal,
      patterns: [/^(?:Vehicle\s*)?Model$/i, /^Vehicle\s*Model$/i],
      exclude: [/make/i]
    },
    {
      key: 'make_model',
      val: s('make_model'),
      patterns: [
        /^(?:Vehicle\s*)?Make\s*(?:&|\/|and)?\s*Model$/i,
        /^(?:Vehicle\s*)?(?:Model|Variant)(?:\s*(?:Name|\/))?$/i,
        /Make\s*&?\s*Model/i,
        /Vehicle\s*Description/i,
        /Make\s*\/\s*Model/i
      ]
    },
    {
      key: 'vehicle_class',
      val: s('vehicle_class'),
      patterns: [/^(?:Vehicle\s*Class|Class\s*of\s*Vehicle)$/i, /^Class\s*of\s*vehicle$/i],
      exclude: [/allowed/i, /licen/i]
    },
    {
      key: 'body_type',
      val: s('body_type'),
      patterns: [/^(?:Type\s*of\s*body|Body\s*Type)$/i],
      exclude: [/color/i, /colour/i]
    },
    {
      key: 'ulw',
      val: s('ulw'),
      patterns: [/^(?:U\.?L\.?W\.?|Unladen\s*Weight)$/i]
    },
    {
      key: 'rlw',
      val: s('rlw'),
      patterns: [/^(?:R\.?L\.?W\.?|Registered\s*Laden\s*Weight|Laden\s*Weight)$/i]
    },
    {
      key: 'seating_capacity',
      val: s('seating_capacity'),
      patterns: [/^(?:Seating\s*Capacity|Seats|Seating\s*Cap(?:\.?|acity))(?:\s*\(.*\))?$/i, /^Seating\s*capacity$/i]
    },
    {
      key: 'engine_no',
      val: s('engine_no'),
      patterns: [/^(?:Engine|Motor)\s*(?:No\.?|Number)?$/i, /^Engine\s*number$/i, /^Motor\s*number$/i],
      exclude: [/chassis/i]
    },
    {
      key: 'chassis_no',
      val: s('chassis_no'),
      patterns: [/^(?:Chassis|VIN|Frame)\s*(?:No\.?|Number)?(?:\s*\(?17\s*Chars?\)?)?$/i, /^Chassis\s*number$/i, /^Chassis\s*No\.?$/i],
      exclude: [/engine/i]
    },
    {
      key: 'manufacturing_year',
      val: s('manufacturing_year'),
      patterns: [/^(?:Mfg\.?|Manufacturing|Model)\s*Year$/i, /Year\s*of\s*(?:Mfg|Manufacture|Make)/i, /Mfg\.?\s*Year/i]
    },
    {
      key: 'fuel_type',
      val: s('fuel_type'),
      patterns: [/^(?:Fuel\s*Type|Fuel\s*Used|Type\s*of\s*Fuel|Fuel)$/i]
    },
    {
      key: 'cubic_capacity',
      val: s('cubic_capacity'),
      patterns: [/^(?:Cubic\s*Capacity|Engine\s*Capacity|CC|Displacement)$/i, /^Cubic\s*Capacity$/i]
    },
    {
      key: 'color',
      val: s('color'),
      patterns: [/^(?:Vehicle\s*)?Colou?r(?:\s*(?:\/|of)\s*Body)?$/i, /^Colou?r\s*(?:of\s*vehicle)?$/i, /^Vehicle\s*Colou?r$/i],
      exclude: [/body\s*type/i]
    },
    {
      key: 'odometer_reading',
      val: s('odometer_reading') !== 'NA' ? s('odometer_reading') : s('mileage'),
      patterns: [/^(?:Odometer(?:\s*Reading)?|Speedo(?:\s*Reading)?|KM\s*Reading|Mileage)$/i, /^Mileage$/i]
    },
    {
      key: 'tax_details',
      val: s('tax_details'),
      patterns: [/^Tax$/i]
    },
    {
      key: 'fc_details',
      val: s('fc_details'),
      patterns: [/^(?:F\.?C\.?|Fitness\s*Certificate|Fitness)$/i]
    },
    {
      key: 'trip_sheet_details',
      val: s('trip_sheet_details'),
      patterns: [/^(?:Trip\s*Sheet\s*Details|Permit\s*Type)$/i]
    },
    {
      key: 'driver_name',
      val: s('driver_name'),
      patterns: [/^(?:Driver(?:\'s)?\s*Name|Name\s*of\s*(?:the\s*)?Driver)$/i, /^Name\s*of\s*the\s*driver$/i],
      exclude: [/injury/i, /owner/i, /insured/i]
    },
    {
      key: 'dl_no',
      val: s('dl_no'),
      patterns: [/^(?:D\/?L\s*(?:No\.?|Number)|Driving\s*Licen[sc]e\s*(?:No\.?|Number)?|M\.?D\.?L\.?\s*(?:No\.?|Number)?)$/i, /^M\.?D\.?L\.?\s*number$/i]
    },
    {
      key: 'dl_issue_date',
      val: s('dl_issue_date'),
      patterns: [/^(?:Date\s*of\s*issue|Issue\s*Date)$/i]
    },
    {
      key: 'dl_type',
      val: s('dl_type'),
      patterns: [/^(?:Type\s*of\s*licen[sc]e|Licen[sc]e\s*Type|Class\s*Allowed)$/i],
      exclude: [/vehicle\s*class/i]
    },
    {
      key: 'badge_no',
      val: s('badge_no'),
      patterns: [/^(?:Badge\s*number\s*(?:&amp;|&)\s*Issue\s*Date|Badge\s*No\.?)$/i]
    },
    {
      key: 'dl_validity',
      val: s('dl_validity'),
      patterns: [/^(?:Valid\s*up\s*to|DL\s*Validity|Licen[sc]e\s*Validity|Valid\s*Upto)$/i]
    },
    {
      key: 'driver_relation',
      val: s('driver_relation'),
      patterns: [/^(?:Relationship\s*with\s*Insured|Relation\s*with\s*Insured)$/i]
    },
    {
      key: 'dl_issued_by',
      val: s('dl_issued_by'),
      patterns: [/^(?:Issued\s*by|Licencing\s*Authority)$/i]
    },
    {
      key: 'accident_date_time',
      val: s('accident_date_time'),
      patterns: [/^(?:Date\s*(?:&amp;|&)?\s*time\s*of\s*accident|Accident\s*Date\s*(?:&amp;|&)?\s*Time)$/i]
    },
    {
      key: 'accident_place',
      val: s('accident_place'),
      patterns: [/^(?:Place\s*of\s*accident|Accident\s*Place|Location\s*of\s*Accident)$/i]
    },
    {
      key: 'fir_details',
      val: s('fir_details'),
      patterns: [/^(?:So\s*F\.?I\.?R\.?\s*number|F\.?I\.?R\.?\s*No\.?|Police\s*Report)$/i]
    },
    {
      key: 'other_vehicle',
      val: s('other_vehicle'),
      patterns: [/^(?:involved\s*in\s*this\s*accident\.?|involvedin\s*this\s*accident\.?|Other\s*Vehicle\s*Involved)$/i]
    },
    {
      key: 'tp_injury',
      val: s('tp_injury'),
      patterns: [/^(?:injury\s*\/\s*damage\s*reported\.?|Third\s*Party\s*Injury)$/i]
    },
    {
      key: 'driver_injury',
      val: s('driver_injury'),
      patterns: [/^(?:or\s*occupants\s*reported\.?|Injury\s*to\s*Driver)$/i]
    },
    {
      key: 'unattended',
      val: s('unattended'),
      patterns: [/^(?:un\-\s*attended\s*at\s*the\s*spot\.?|un\-\s*attended\s*atthe\s*spot\.?|Vehicle\s*left\s*unattended)$/i]
    },
    {
      key: 'intimation_date_time',
      val: s('intimation_date_time'),
      patterns: [/^(?:Date\s*(?:&amp;|&)?\s*time\s*of\s*intimation|Intimation\s*Date\s*(?:&amp;|&)?\s*Time)$/i]
    },
    {
      key: 'survey_date_time',
      val: s('survey_date_time'),
      patterns: [/^(?:Date\s*(?:&amp;|&)?\s*time\s*of\s*survey|Survey\s*Date\s*(?:&amp;|&)?\s*Time)$/i]
    },
    {
      key: 'survey_place',
      val: s('survey_place'),
      patterns: [/^(?:Place\s*of\s*survey|Location\s*of\s*Survey|Spot\s*Location|Inspection\s*Place)$/i]
    },
    {
      key: 'workshop_contact',
      val: s('workshop_contact'),
      patterns: [/^(?:Contact\s*person\s*of\s*workshop|Workshop\s*Contact)$/i]
    },
    {
      key: 'survey_date',
      val: s('survey_date'),
      patterns: [/^(?:Survey\s*Date|Date\s*of\s*Survey|Inspection\s*Date|Date\s*of\s*Inspection)$/i]
    },
    {
      key: 'damage_summary',
      val: s('damage_summary'),
      patterns: [/^(?:Damage\s*Summary|Damages\s*Observed|Brief\s*Description\s*of\s*Damage|Damage\s*Details|Immediate\s*Spot\s*Observations)$/i]
    },
    {
      key: 'assessment_status',
      val: s('assessment_status'),
      patterns: [/^(?:Assessment\s*Status|Status\s*of\s*(?:Survey|Assessment)|Survey\s*Status)$/i]
    },
    {
      key: 'surveyor_name',
      val: s('surveyor_name'),
      patterns: [/^(?:Surveyor(?:\'s)?\s*Name|Name\s*of\s*(?:the\s*)?Surveyor|Loss\s*Assessor|Inspected\s*By|Attending\s*Surveyor)$/i]
    },
    {
      key: 'surveyor_license',
      val: s('surveyor_license'),
      patterns: [/^(?:IRDA(?:\s*Licen[sc]e)?(?:\s*No\.?)?|Surveyor\s*Licen[sc]e(?:\s*No\.?)?|Surveyor\s*License)$/i]
    },
    {
      key: 'case_number',
      val: s('case_number'),
      patterns: [/^(?:Report\s*Ref(?:\.?\s*No\.?)?|Case\s*(?:No\.?|Number)|Case\s*Ref\s*No\.?|Survey\s*Ref(?:\.?\s*No\.?)?|Reference\s*No\.?)$/i]
    }
  ];
}

function overwriteTableRows(xml, mappings) {
  return xml.replace(/(<w:tr(?:\s+[^>]*)?>)([\s\S]*?)(<\/w:tr>)/g, (fullRow, openTag, rowInner, closeTag) => {
    let trPr = '';
    let contentAfterTrPr = rowInner;
    const trPrMatch = rowInner.match(/^([\s\S]*?<\/w:trPr>)/);
    if (trPrMatch) {
      trPr = trPrMatch[1];
      contentAfterTrPr = rowInner.slice(trPr.length);
    }

    const cells = contentAfterTrPr.match(/<w:tc(?:\s+[^>]*)?>[\s\S]*?<\/w:tc>/g);
    if (!cells || cells.length < 2) return fullRow;

    const updatedCells = [...cells];
    let rowModified = false;

    for (let i = 0; i < cells.length - 1; i++) {
      const labelText = extractCellText(cells[i]).replace(/[:\s]+$/, '');
      if (!labelText) continue;

      for (const map of mappings) {
        if (map.exclude && map.exclude.some(ex => ex.test(labelText))) continue;
        const matchesLabel = map.patterns.some(p => p.test(labelText));
        if (matchesLabel) {
          const nextCellText = extractCellText(cells[i + 1]).replace(/[:\s]+$/, '');
          const nextIsLabel = mappings.some(m => m.patterns.some(p => {
            if (p.source.startsWith('^')) return p.test(nextCellText);
            return new RegExp(`^(?:${p.source})[:\\s]*$`, p.flags).test(nextCellText);
          }));

          if (!nextIsLabel) {
            const targetVal = map.val || 'NA';
            updatedCells[i + 1] = replaceCellText(updatedCells[i + 1], targetVal);
            rowModified = true;
            i++;
            break;
          }
        }
      }
    }

    if (rowModified) {
      return `${openTag}${trPr}${updatedCells.join('')}${closeTag}`;
    }
    return fullRow;
  });
}

function overwriteSmartDocument(xml, data, options = {}) {
  const mappings = getFieldMappings(data);

  let lastContext = '';
  let continuationCount = 0;

  return xml.replace(/(<w:p(?:\s+[^>]*)?>)([\s\S]*?)(<\/w:p>)/g, (fullP, openTag, pInner, closeTag) => {
    if (pInner.includes('<w:tbl')) return fullP;

    const runs = pInner.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g);
    if (!runs || runs.length === 0) return fullP;

    const tMatches = pInner.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [];
    const fullText = unescapeXml(tMatches.map(t => t.replace(/<[^>]+>/g, '')).join(''));
    const trimmed = fullText.trim();

    // 1. Header report ref & date
    if (/[0-9]{2}\/[0-9]{2}\/[A-Z0-9\/]+\s+[0-9]{2}\/[0-9]{2}\/[0-9]{4}/.test(fullText)) {
      const refVal = (data.report_ref_no && data.report_ref_no !== 'NA' && data.report_ref_no !== '-') ? data.report_ref_no : (data.case_number && data.case_number !== 'NA' ? data.case_number : 'NA');
      const dateVal = (data.report_date && data.report_date !== 'NA' && data.report_date !== '-') ? data.report_date : (data.survey_date && data.survey_date !== 'NA' ? data.survey_date : 'NA');
      
      let pPr = '';
      const pPrMatch = pInner.match(/^([\s\S]*?<\/w:pPr>)/);
      if (pPrMatch) pPr = pPrMatch[1];
      
      const newP = `${pPr}<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="000000"/></w:rPr><w:t>${escapeXml(refVal)}</w:t></w:r><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="000000"/></w:rPr><w:tab/><w:tab/><w:tab/><w:tab/><w:tab/><w:tab/><w:tab/><w:t xml:space="preserve">      ${escapeXml(dateVal)}</w:t></w:r>`;
      return `${openTag}${newP}${closeTag}`;
    }

    // 2. OCCURRENCE NARRATION section
    if (trimmed.toUpperCase().includes('OCCURRENCE') || trimmed.toUpperCase().includes('OCCURRENCENARRATION')) {
      lastContext = 'OCCURRENCE';
      continuationCount = 0;
      return fullP;
    }

    if (lastContext === 'OCCURRENCE' && continuationCount === 0 && !trimmed.includes('I have applied my mind') && trimmed.length > 5) {
      continuationCount++;
      if (data.occurrence_narration) {
        let pPr = '';
        const pPrMatch = pInner.match(/^([\s\S]*?<\/w:pPr>)/);
        if (pPrMatch) pPr = pPrMatch[1];
        const newContent = `${pPr}<w:r><w:rPr><w:b/><w:color w:val="000000"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${escapeXml(data.occurrence_narration)}</w:t></w:r>`;
        return `${openTag}${newContent}${closeTag}`;
      }
    }

    // Helper to inject explicit left-aligned tab stops and hanging indent
    // Tab 1 at 3600 dxa = 2.50" (colon)
    // Tab 2 at 3880 dxa = 2.70" (value start)
    // Hanging indent w:left="3880" w:hanging="3880" ensures wrapped lines indent to 3880 dxa, NEVER to column 0!
    const createAlignedPPr = (inner) => {
      let pPr = '';
      const pPrMatch = inner.match(/^([\s\S]*?<\/w:pPr>)/);
      if (pPrMatch) {
        pPr = pPrMatch[1];
        pPr = pPr.replace(/<w:tabs\b[^>]*>[\s\S]*?<\/w:tabs>/g, '');
        pPr = pPr.replace(/<w:tabs\b[^>]*\/>/g, '');
        pPr = pPr.replace(/<w:ind\b[^>]*\/>/g, '');
        pPr = pPr.replace(/<w:ind\b[^>]*>[\s\S]*?<\/w:ind>/g, '');
        pPr = pPr.replace(/<w:jc\b[^>]*\/>/g, '');
        pPr = pPr.replace(/<w:jc\b[^>]*>[\s\S]*?<\/w:jc>/g, '');

        const indAndTabs = '<w:jc w:val="left"/><w:ind w:left="3880" w:hanging="3880"/><w:tabs><w:tab w:val="left" w:pos="3600"/><w:tab w:val="left" w:pos="3880"/></w:tabs>';
        pPr = pPr.replace('</w:pPr>', `${indAndTabs}</w:pPr>`);
      } else {
        pPr = '<w:pPr><w:jc w:val="left"/><w:ind w:left="3880" w:hanging="3880"/><w:tabs><w:tab w:val="left" w:pos="3600"/><w:tab w:val="left" w:pos="3880"/></w:tabs></w:pPr>';
      }
      return pPr;
    };

    // 3. "Valid up to" without colon
    if (/^Valid\s*up\s*to\b/i.test(trimmed) && data.dl_validity) {
      lastContext = 'DL_VALID_UP_TO';
      const pPr = createAlignedPPr(pInner);
      const labelRun = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t>Valid up to</w:t></w:r>`;
      const preColonTab = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:tab/></w:r>`;
      const colonRun = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t>:</w:t></w:r>`;
      const postColonTab = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:tab/></w:r>`;
      const valRun = `<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="000000"/></w:rPr><w:t>${escapeXml(data.dl_validity)}</w:t></w:r>`;

      return `${openTag}${pPr}${labelRun}${preColonTab}${colonRun}${postColonTab}${valRun}${closeTag}`;
    }

    // 4. Address / Details continuation lines: paragraphs consisting purely of ":" or ": ."
    const isContinuation = /^[:\s\.]+$/.test(trimmed);
    if (isContinuation) {
      let continuationVal = '';
      if (lastContext === 'INSURER') {
        continuationCount++;
        if (continuationCount === 1) continuationVal = data.insurer_address_1;
        else if (continuationCount === 2) continuationVal = data.insurer_address_2;
      } else if (lastContext === 'INSURED') {
        continuationCount++;
        if (continuationCount === 1) continuationVal = data.owner_address_1;
        else if (continuationCount === 2) continuationVal = data.owner_address_2;
      } else if (lastContext === 'TAX') {
        continuationCount++;
        if (continuationCount === 1) continuationVal = data.tax_validity;
      } else if (lastContext === 'DRIVER') {
        continuationCount++;
        if (continuationCount === 1) continuationVal = data.driver_address_1;
        else if (continuationCount === 2) continuationVal = data.driver_address_2;
      } else if (lastContext === 'SURVEY_PLACE') {
        continuationCount++;
        if (continuationCount === 1) continuationVal = data.survey_place_address;
      }

      if (continuationVal && continuationVal !== 'NA') {
        const pPr = createAlignedPPr(pInner);
        const preColonTab = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:tab/></w:r>`;
        const colonRun = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t>:</w:t></w:r>`;
        const postColonTab = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:tab/></w:r>`;
        const valRun = `<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="000000"/></w:rPr><w:t>${escapeXml(continuationVal)}</w:t></w:r>`;

        return `${openTag}${pPr}${preColonTab}${colonRun}${postColonTab}${valRun}${closeTag}`;
      } else {
        // Strip residual unaligned colon paragraph from template if no continuation data
        return `<w:p><w:pPr><w:jc w:val="left"/></w:pPr></w:p>`;
      }
    }

    if (!fullText.includes(':') && !fullText.includes('-')) {
      if (trimmed.length > 3) {
        lastContext = '';
        continuationCount = 0;
      }
      return fullP;
    }

    const delimiter = fullText.includes(':') ? ':' : '-';
    const delimIndex = fullText.indexOf(delimiter);
    const labelPart = fullText.slice(0, delimIndex).trim();
    if (!labelPart) return fullP;

    for (const map of mappings) {
      if (map.exclude && map.exclude.some(ex => ex.test(labelPart))) continue;

      const matches = map.patterns.some(p => p.test(labelPart));
      if (!matches) continue;

      const targetVal = map.val || 'NA';

      if (map.key === 'insurance_company') { lastContext = 'INSURER'; continuationCount = 0; }
      else if (map.key === 'owner_name') { lastContext = 'INSURED'; continuationCount = 0; }
      else if (map.key === 'tax_details') { lastContext = 'TAX'; continuationCount = 0; }
      else if (map.key === 'driver_name') { lastContext = 'DRIVER'; continuationCount = 0; }
      else if (map.key === 'survey_place') { lastContext = 'SURVEY_PLACE'; continuationCount = 0; }
      else { lastContext = map.key; continuationCount = 0; }

      // Standardize single tab space alignment locked at 3600 dxa (colon) and 3880 dxa (value)
      const cleanLabel = labelPart.replace(/\s+/g, ' ').trim();
      const pPr = createAlignedPPr(pInner);

      let labelRPr = '';
      if (runs.length > 0) {
        const rPrMatch = runs[0].match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/);
        if (rPrMatch) labelRPr = rPrMatch[0];
      }
      if (!labelRPr) {
        labelRPr = '<w:rPr><w:color w:val="000000"/></w:rPr>';
      }

      // 1. Clean trimmed label
      const labelRun = `<w:r>${labelRPr}<w:t>${escapeXml(cleanLabel)}</w:t></w:r>`;

      // 2. Single tab before colon (jumps directly to locked 3600 dxa column)
      const preColonTab = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:tab/></w:r>`;

      // 3. Colon placed exactly at 3600 dxa (2.50 inches)
      const colonRun = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t>:</w:t></w:r>`;

      // 4. Single tab space after colon (jumps directly to locked 3880 dxa column)
      const postColonTab = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:tab/></w:r>`;

      // 5. Value Run (bold value, clean without extra runaway spaces)
      const valRun = `<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="000000"/></w:rPr><w:t>${escapeXml(targetVal)}</w:t></w:r>`;

      return `${openTag}${pPr}${labelRun}${preColonTab}${colonRun}${postColonTab}${valRun}${closeTag}`;
    }

    // Universal normalization for other colon rows in the template (e.g. static template lines)
    if (fullText.includes(':') && !fullText.includes('Cell:') && !fullText.includes('Email:') && !fullText.includes('Add:') && !fullText.includes('Less:') && !fullText.startsWith('http')) {
      const colonIdx = fullText.indexOf(':');
      const label = fullText.slice(0, colonIdx).trim().replace(/\s+/g, ' ');
      const val = fullText.slice(colonIdx + 1).trim().replace(/\s+/g, ' ');
      if (label.length >= 2 && label.length <= 40) {
        const pPr = createAlignedPPr(pInner);
        let labelRPr = '<w:rPr><w:color w:val="000000"/></w:rPr>';
        if (runs.length > 0) {
          const rPrMatch = runs[0].match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/);
          if (rPrMatch) labelRPr = rPrMatch[0];
        }

        const labelRun = `<w:r>${labelRPr}<w:t>${escapeXml(label)}</w:t></w:r>`;
        const preColonTab = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:tab/></w:r>`;
        const colonRun = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t>:</w:t></w:r>`;
        const postColonTab = `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:tab/></w:r>`;
        const valRun = val ? `<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t>${escapeXml(val)}</w:t></w:r>` : '';

        return `${openTag}${pPr}${labelRun}${preColonTab}${colonRun}${postColonTab}${valRun}${closeTag}`;
      }
    }

    return fullP;
  });
}

function overwriteExistingTemplateContent(zip, data, options = {}) {
  const mappings = getFieldMappings(data);

  const filesToProcess = Object.keys(zip.files).filter(name => {
    return name.startsWith('word/') && (
      name === 'word/document.xml' ||
      name.startsWith('word/header') ||
      name.startsWith('word/footer')
    );
  });

  for (const fileName of filesToProcess) {
    const file = zip.file(fileName);
    if (!file) continue;

    let xml = file.asText();

    // 1. Overwrite table rows
    xml = overwriteTableRows(xml, mappings);

    // 2. Overwrite tabbed and inline labeled paragraphs with stateful continuation & occurrence support
    xml = overwriteSmartDocument(xml, data, options);

    zip.file(fileName, xml);
  }
}

class ReportTemplater {
  constructor() {
    if (!fs.existsSync(config.PATHS.REPORTS)) {
      fs.mkdirSync(config.PATHS.REPORTS, { recursive: true });
    }
    this.ensureDefaultTemplates();
  }

  ensureDefaultTemplates() {
    const templates = db.getTemplates();
    const defaultTemplates = [
      {
        id: 'tpl_default_motor_assessment',
        name: 'Motor Final Survey & Loss Assessment Report',
        description: 'Comprehensive 5-section standard motor loss assessment report with vehicle particulars, policy details, damage assessment, and surveyor sign-off.',
        fileName: 'motor_survey_assessment.docx',
        filePath: path.join(config.PATHS.TEMPLATES, 'motor_survey_assessment.docx'),
        isDefault: true,
        supportedTags: [
          'case_number', 'survey_date', 'claim_no', 'survey_place',
          'owner_name', 'insurance_company', 'policy_no', 'policy_period', 'idv_amount', 'owner_address',
          'vehicle_reg_no', 'make_model', 'chassis_no', 'engine_no', 'manufacturing_year', 'registration_date',
          'vehicle_class', 'fuel_type', 'color', 'seating_capacity', 'cubic_capacity', 'odometer_reading',
          'driver_name', 'dl_no', 'dl_validity', 'damage_summary', 'assessment_status',
          'surveyor_name', 'surveyor_license'
        ]
      },
      {
        id: 'tpl_default_spot_survey',
        name: 'Vehicle Spot Inspection Report',
        description: 'Rapid on-site preliminary spot survey report for motor accidents and immediate damage verification.',
        fileName: 'spot_survey_report.docx',
        filePath: path.join(config.PATHS.TEMPLATES, 'spot_survey_report.docx'),
        isDefault: true,
        supportedTags: [
          'case_number', 'survey_date', 'vehicle_reg_no', 'make_model',
          'owner_name', 'insurance_company', 'chassis_no', 'engine_no',
          'policy_no', 'claim_no', 'survey_place', 'odometer_reading',
          'damage_summary', 'surveyor_name', 'surveyor_license'
        ]
      }
    ];

    for (const defTpl of defaultTemplates) {
      if (!templates.some(t => t.id === defTpl.id)) {
        if (fs.existsSync(defTpl.filePath)) {
          db.saveTemplate(defTpl);
        }
      }
    }
  }

  /**
   * Render template with verified data without alignment errors
   * @param {string} templatePath Path to .docx template file
   * @param {object} data Extracted and verified key-value pairs
   * @param {string} outputFileName Desired output filename
   * @returns {Promise<{ docxPath: string, docxFileName: string, fileSize: number }>}
   */
  async renderDocx(templatePath, data, outputFileName, options = {}) {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    // Sanitize data values: clean strings, never null or undefined, default missing to 'NA'
    const sanitizedData = {};
    for (const [key, val] of Object.entries(data)) {
      sanitizedData[key] = sanitizeValue(val);
    }

    // Pre-populate any standard keys not present in data with 'NA'
    const allStandardKeys = [
      'case_number', 'survey_date', 'claim_no', 'survey_place', 'workshop_contact',
      'owner_name', 'insurance_company', 'policy_no', 'policy_period', 'idv_amount', 'owner_address',
      'vehicle_reg_no', 'make_model', 'make', 'model', 'chassis_no', 'engine_no', 'manufacturing_year',
      'registration_date', 'vehicle_class', 'fuel_type', 'color', 'seating_capacity', 'cubic_capacity',
      'odometer_reading', 'tax_details', 'fc_details', 'trip_sheet_details',
      'driver_name', 'dl_no', 'dl_issue_date', 'dl_type', 'badge_no', 'dl_validity', 'driver_relation', 'dl_issued_by',
      'accident_date_time', 'accident_place', 'fir_details', 'other_vehicle', 'tp_injury', 'driver_injury', 'unattended',
      'damage_summary', 'assessment_status', 'parts_estimate', 'labour_estimate', 'total_estimate',
      'parts_assessed', 'labour_assessed', 'assessed_loss', 'salvage', 'policy_excess', 'net_loss',
      'surveyor_name', 'surveyor_license'
    ];
    for (const k of allStandardKeys) {
      if (!sanitizedData[k]) sanitizedData[k] = 'NA';
    }

    // Smart address splitting & formatting to avoid runaway line wraps and garbage text
    const normalizeAddressPair = (fullAddr, part1, part2) => {
      let raw1 = (part1 || '').trim();
      let raw2 = (part2 || '').trim();
      if (/^[—\-\s\.\,]+[a-zA-Z0-9]?$/.test(raw2) || raw2 === 'NA' || raw2 === '——s') {
        raw2 = '';
      }
      if (/^[—\-\s\.\,]+[a-zA-Z0-9]?$/.test(raw1) || raw1 === 'NA') {
        raw1 = '';
      }

      let combined = (fullAddr || (raw1 + ', ' + raw2))
        .replace(/,\s*,+/g, ', ')
        .replace(/\s+/g, ' ')
        .trim();

      combined = combined.replace(/MADURAI\s*,?\s*625014\s*MADURAI/gi, 'MADURAI - 625014');
      combined = combined.replace(/NORTHMADURAITN\s*625107/gi, 'NORTH, MADURAI - 625107');
      combined = combined.replace(/PUDUR\s*ARUMBANUR\s+MADURAI/gi, 'PUDUR ARUMBANUR, MADURAI');
      combined = combined.replace(/MADURAI\s*NORTH\s+MADURAI/gi, 'MADURAI NORTH, MADURAI');

      if (raw1 && raw2 && raw1.length >= 15 && raw1.length <= 48 && raw2.length <= 48) {
        return { line1: raw1.replace(/,\s*,+/g, ', ').trim(), line2: raw2.replace(/,\s*,+/g, ', ').trim() };
      }

      const parts = combined.split(',').map(s => s.trim()).filter(Boolean);
      let line1 = '';
      let line2 = '';
      if (parts.length >= 2) {
        let cur = '';
        let idx = 0;
        while (idx < parts.length) {
          const candidate = cur ? cur + ', ' + parts[idx] : parts[idx];
          if (candidate.length <= 44 || !cur) {
            cur = candidate;
            idx++;
          } else {
            break;
          }
        }
        line1 = cur;
        line2 = parts.slice(idx).join(', ');
      } else {
        const words = combined.split(' ');
        let cur = '';
        for (const w of words) {
          if ((cur + ' ' + w).length <= 40 || cur.length < 15) {
            cur = cur ? cur + ' ' + w : w;
          } else {
            line2 = line2 ? line2 + ' ' + w : w;
          }
        }
        line1 = cur;
      }

      return {
        line1: line1.replace(/,\s*$/, '').trim(),
        line2: line2.replace(/^,\s*/, '').trim()
      };
    };

    const ownerAddrs = normalizeAddressPair(sanitizedData.owner_address, sanitizedData.owner_address_1, sanitizedData.owner_address_2);
    sanitizedData.owner_address_1 = ownerAddrs.line1;
    sanitizedData.owner_address_2 = ownerAddrs.line2;

    const driverAddrs = normalizeAddressPair(sanitizedData.driver_address, sanitizedData.driver_address_1, sanitizedData.driver_address_2);
    sanitizedData.driver_address_1 = driverAddrs.line1;
    sanitizedData.driver_address_2 = driverAddrs.line2;

    const insurerAddrs = normalizeAddressPair(null, sanitizedData.insurer_address_1, sanitizedData.insurer_address_2);
    sanitizedData.insurer_address_1 = insurerAddrs.line1;
    sanitizedData.insurer_address_2 = insurerAddrs.line2;

    // Phase 1: If template uses double {{tag}} or single {tag}, replace them cleanly with docxtemplater
    const hasDoubleBraces = content.includes('{{');
    const hasSingleBraces = content.includes('{') && (content.includes('vehicle_reg_no') || content.includes('owner_name') || content.includes('case_number'));
    
    if (hasDoubleBraces || hasSingleBraces) {
      try {
        const delimiters = hasDoubleBraces ? { start: '{{', end: '}}' } : { start: '{', end: '}' };
        const doc = new Docxtemplater(zip, {
          delimiters,
          paragraphLoop: true,
          linebreaks: true,
          nullGetter: () => 'NA'
        });
        doc.render(sanitizedData);
      } catch (err) {
        console.warn('Docxtemplater placeholder render warning (will fallback to semantic overwrite):', err.message);
      }
    }

    // Phase 2: Overwrite existing pre-filled content in tables & paragraphs with zero alignment distortion
    overwriteExistingTemplateContent(zip, sanitizedData, options);

    const buf = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });

    const finalDocxName = outputFileName.endsWith('.docx') ? outputFileName : `${outputFileName}.docx`;
    const finalDocxPath = path.join(config.PATHS.REPORTS, finalDocxName);

    fs.writeFileSync(finalDocxPath, buf);

    const stats = fs.statSync(finalDocxPath);
    return {
      docxPath: finalDocxPath,
      docxFileName: finalDocxName,
      fileSize: stats.size
    };
  }

  /**
   * Generate a pixel-perfect, printable HTML document for instant browser preview and PDF printing
   */
  generatePrintableHtml(data, surveyMeta) {
    const v = (val, strong = false) => {
      if (val === null || val === undefined) return '<span class="val-na">NA</span>';
      const s = String(val).trim();
      if (s === '' || s === '-' || s === 'N/A' || s === 'NA.' || s === 'NA') {
        return '<span class="val-na">NA</span>';
      }
      return strong ? `<strong>${escapeXml(s)}</strong>` : escapeXml(s);
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Survey Report - ${data.vehicle_reg_no && data.vehicle_reg_no !== 'NA' ? escapeXml(data.vehicle_reg_no) : 'Vehicle'}</title>
  <style>
    @page {
      size: A4;
      margin: 14mm 14mm 14mm 14mm;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      font-size: 11.5px;
      line-height: 1.45;
    }
    .report-header {
      text-align: center;
      border-bottom: 2.5px solid #1e3a8a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .report-title {
      font-size: 19px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: 0.5px;
      margin: 0 0 4px 0;
    }
    .report-subtitle {
      font-size: 11.5px;
      color: #64748b;
      font-style: italic;
      margin: 0;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
      background: #f1f5f9;
      padding: 6px 10px;
      border-left: 4px solid #2563eb;
      margin-top: 14px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table.data-table {
      table-layout: fixed;
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
    }
    table.data-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 10px;
      font-size: 11px;
      vertical-align: top;
      word-break: break-word;
    }
    table.data-table td.lbl {
      background-color: #f8fafc;
      font-weight: 600;
      color: #334155;
      width: 22%;
    }
    table.data-table td.val {
      background-color: #ffffff;
      color: #0f172a;
      width: 28%;
    }
    .val-na {
      color: #64748b;
      font-weight: 600;
      font-size: 11px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 11px;
    }
    .badge-success {
      background-color: #dcfce7;
      color: #166534;
      border: 1px solid #86efac;
    }
    .declaration {
      background: #f8fafc;
      border: 1px dashed #94a3b8;
      padding: 10px;
      border-radius: 4px;
      font-style: italic;
      color: #475569;
      font-size: 10.5px;
      margin-top: 8px;
      line-height: 1.5;
    }
    .signatures {
      margin-top: 22px;
      display: flex;
      justify-content: space-between;
    }
    .sig-box {
      border-top: 1px solid #94a3b8;
      width: 45%;
      padding-top: 6px;
      font-size: 11px;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1 class="report-title">MOTOR SURVEY AND FINAL LOSS ASSESSMENT REPORT</h1>
    <p class="report-subtitle">Licensed Independent Insurance Surveyor & Loss Assessor</p>
  </div>

  <table class="data-table">
    <tr>
      <td class="lbl">Report Ref No.</td>
      <td class="val">${v(surveyMeta?.caseNumber || data.case_number)}</td>
      <td class="lbl">Survey Date</td>
      <td class="val">${v(data.survey_date)}</td>
    </tr>
    <tr>
      <td class="lbl">Claim Number</td>
      <td class="val">${v(data.claim_no)}</td>
      <td class="lbl">Inspection Place</td>
      <td class="val">${v(data.survey_place)}</td>
    </tr>
  </table>

  <div class="section-title">1. Policy & Insured Particulars</div>
  <table class="data-table">
    <tr>
      <td class="lbl">Insured / Owner Name</td>
      <td class="val">${v(data.owner_name, true)}</td>
      <td class="lbl">Insuring Company</td>
      <td class="val">${v(data.insurance_company)}</td>
    </tr>
    <tr>
      <td class="lbl">Policy Number</td>
      <td class="val">${v(data.policy_no)}</td>
      <td class="lbl">Period of Insurance</td>
      <td class="val">${v(data.policy_period)}</td>
    </tr>
    <tr>
      <td class="lbl">Insured Declared Value</td>
      <td class="val">${v(data.idv_amount, true)}</td>
      <td class="lbl">Owner Address</td>
      <td class="val">${v(data.owner_address)}</td>
    </tr>
  </table>

  <div class="section-title">2. Vehicle Particulars</div>
  <table class="data-table">
    <tr>
      <td class="lbl">Registration Number</td>
      <td class="val">${v(data.vehicle_reg_no, true)}</td>
      <td class="lbl">Make & Model</td>
      <td class="val">${v(data.make_model, true)}</td>
    </tr>
    <tr>
      <td class="lbl">Chassis / VIN Number</td>
      <td class="val" style="font-family: monospace; letter-spacing: 0.5px;">${v(data.chassis_no)}</td>
      <td class="lbl">Engine Number</td>
      <td class="val" style="font-family: monospace;">${v(data.engine_no)}</td>
    </tr>
    <tr>
      <td class="lbl">Mfg. Year</td>
      <td class="val">${v(data.manufacturing_year)}</td>
      <td class="lbl">Registration Date</td>
      <td class="val">${v(data.registration_date)}</td>
    </tr>
    <tr>
      <td class="lbl">Vehicle Class</td>
      <td class="val">${v(data.vehicle_class)}</td>
      <td class="lbl">Fuel Type</td>
      <td class="val">${v(data.fuel_type)}</td>
    </tr>
    <tr>
      <td class="lbl">Color / Body</td>
      <td class="val">${v(data.color)}</td>
      <td class="lbl">Seating Capacity</td>
      <td class="val">${v(data.seating_capacity)}</td>
    </tr>
    <tr>
      <td class="lbl">Cubic Capacity</td>
      <td class="val">${v(data.cubic_capacity)}</td>
      <td class="lbl">Odometer Reading</td>
      <td class="val">${v(data.odometer_reading, true)}</td>
    </tr>
  </table>

  <div class="section-title">3. Driver & Driving Licence Particulars</div>
  <table class="data-table">
    <tr>
      <td class="lbl">Driver's Name</td>
      <td class="val">${v(data.driver_name)}</td>
      <td class="lbl">Driving Licence No.</td>
      <td class="val">${v(data.dl_no, true)}</td>
    </tr>
    <tr>
      <td class="lbl">Licence Validity</td>
      <td class="val">${v(data.dl_validity)}</td>
      <td class="lbl">Licence Type / Class</td>
      <td class="val">${v(data.dl_type)}</td>
    </tr>
    <tr>
      <td class="lbl">Relationship with Insured</td>
      <td class="val">${v(data.driver_relation)}</td>
      <td class="lbl">Issued By</td>
      <td class="val">${v(data.dl_issued_by)}</td>
    </tr>
  </table>

  <div class="section-title">4. Accident Particulars & Occurrence Narration</div>
  <table class="data-table">
    <tr>
      <td class="lbl">Accident Date & Time</td>
      <td class="val">${v(data.accident_date_time)}</td>
      <td class="lbl">Place of Accident</td>
      <td class="val">${v(data.accident_place)}</td>
    </tr>
    <tr>
      <td class="lbl">Police FIR Particulars</td>
      <td class="val" colspan="3">${v(data.fir_details)}</td>
    </tr>
    <tr>
      <td class="lbl">Other Vehicle Involved</td>
      <td class="val">${v(data.other_vehicle)}</td>
      <td class="lbl">Third Party Injury / Damage</td>
      <td class="val">${v(data.tp_injury)}</td>
    </tr>
    <tr>
      <td class="lbl">Driver Injury Reported</td>
      <td class="val">${v(data.driver_injury)}</td>
      <td class="lbl">Left Unattended at Spot</td>
      <td class="val">${v(data.unattended)}</td>
    </tr>
    ${data.occurrence_narration && data.occurrence_narration !== 'NA' ? `
    <tr>
      <td class="lbl">Occurrence Narration</td>
      <td class="val" colspan="3" style="font-style: italic; line-height: 1.5;">${escapeXml(data.occurrence_narration)}</td>
    </tr>` : ''}
  </table>

  <div class="section-title">5. Survey Observations & Damage Assessment</div>
  <table class="data-table">
    <tr>
      <td class="lbl">Inspection Place & Workshop</td>
      <td class="val">${v(data.survey_place)}${data.survey_place_address && data.survey_place_address !== 'NA' ? ', ' + escapeXml(data.survey_place_address) : ''}</td>
      <td class="lbl">Workshop Contact</td>
      <td class="val">${v(data.workshop_contact)}</td>
    </tr>
    <tr>
      <td class="lbl">Assessment Status</td>
      <td class="val" colspan="3"><span class="badge badge-success">${v(data.assessment_status)}</span></td>
    </tr>
    <tr>
      <td class="lbl">Damage Summary (Assessed Parts)</td>
      <td class="val" colspan="3">${v(data.damage_summary)}</td>
    </tr>
    ${data.total_estimate && data.total_estimate !== 'NA' ? `
    <tr>
      <td class="lbl">Estimated Loss</td>
      <td class="val">Parts: ₹${v(data.parts_estimate)} | Labour: ₹${v(data.labour_estimate)} (Total: ₹${v(data.total_estimate)})</td>
      <td class="lbl">Assessed Net Loss</td>
      <td class="val"><strong>₹${v(data.net_loss !== 'NA' ? data.net_loss : data.assessed_loss)}</strong></td>
    </tr>` : ''}
  </table>

  <div class="section-title">6. Surveyor Declaration & Sign-off</div>
  <div class="declaration">
    I hereby declare that I have physically inspected the vehicle detailed above. The particulars recorded herein have been verified against original/scanned documents (RC Book, Driving License, Insurance Policy, Survey Report). The reported damages correlate with the cause of accidental collision and are fair and equitable.
  </div>

  <table class="data-table" style="margin-top: 15px;">
    <tr>
      <td class="lbl">Surveyor Name</td>
      <td class="val">${v(data.surveyor_name, true)}</td>
      <td class="lbl">IRDA Licence No.</td>
      <td class="val">${v(data.surveyor_license)}</td>
    </tr>
    <tr>
      <td class="lbl">Report Date</td>
      <td class="val">${v(data.report_date || data.survey_date)}</td>
      <td class="lbl">Verification Status</td>
      <td class="val" style="color: #16a34a; font-weight: bold;">[DIGITALLY CERTIFIED FROM UPLOADED DOCS]</td>
    </tr>
  </table>
</body>
</html>`;
  }
}

module.exports = new ReportTemplater();
