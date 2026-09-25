const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel
} = require('docx');

const TEMPLATES_DIR = path.resolve(__dirname);
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

function createCell(text, isHeader = false, widthPercent = 25) {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    shading: isHeader ? { fill: 'F8FAFC' } : { fill: 'FFFFFF' },
    margins: { top: 140, bottom: 140, left: 160, right: 160 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
    },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text,
            bold: isHeader,
            size: 20,
            font: 'Arial',
            color: isHeader ? '334155' : '0F172A'
          })
        ]
      })
    ]
  });
}

function createRow(label1, val1, label2, val2) {
  return new TableRow({
    children: [
      createCell(label1, true, 22),
      createCell(val1, false, 28),
      createCell(label2, true, 22),
      createCell(val2, false, 28)
    ]
  });
}

async function buildMotorSurveyAssessmentTemplate() {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }
          }
        },
        children: [
          // Header
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'MOTOR SURVEY AND FINAL LOSS ASSESSMENT REPORT',
                bold: true,
                size: 28,
                font: 'Arial',
                color: '1E3A8A'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Independent Insurance Surveyor & Loss Assessor',
                italics: true,
                size: 20,
                font: 'Arial',
                color: '64748B'
              })
            ]
          }),
          new Paragraph({ text: '' }),

          // Reference Box
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow('Report Ref No.', '{{case_number}}', 'Survey Date', '{{survey_date}}'),
              createRow('Claim Number', '{{claim_no}}', 'Inspection Place', '{{survey_place}}')
            ]
          }),
          new Paragraph({ text: '' }),

          // Section 1: Policy Details
          new Paragraph({
            children: [
              new TextRun({
                text: '1. POLICY & INSURED PARTICULARS',
                bold: true,
                size: 22,
                font: 'Arial',
                color: '0F172A'
              })
            ]
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow('Insured Name', '{{owner_name}}', 'Insuring Co.', '{{insurance_company}}'),
              createRow('Policy Number', '{{policy_no}}', 'Period of Cover', '{{policy_period}}'),
              createRow('IDV Amount', '{{idv_amount}}', 'Insured Address', '{{owner_address}}')
            ]
          }),
          new Paragraph({ text: '' }),

          // Section 2: Vehicle Details
          new Paragraph({
            children: [
              new TextRun({
                text: '2. VEHICLE PARTICULARS',
                bold: true,
                size: 22,
                font: 'Arial',
                color: '0F172A'
              })
            ]
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow('Registration No.', '{{vehicle_reg_no}}', 'Make & Model', '{{make_model}}'),
              createRow('Chassis / VIN No.', '{{chassis_no}}', 'Engine Number', '{{engine_no}}'),
              createRow('Mfg. Year', '{{manufacturing_year}}', 'Reg. Date', '{{registration_date}}'),
              createRow('Vehicle Class', '{{vehicle_class}}', 'Fuel Type', '{{fuel_type}}'),
              createRow('Color / Body', '{{color}}', 'Seating Capacity', '{{seating_capacity}}'),
              createRow('Cubic Capacity', '{{cubic_capacity}}', 'Odometer Reading', '{{odometer_reading}}')
            ]
          }),
          new Paragraph({ text: '' }),

          // Section 3: Driver & License
          new Paragraph({
            children: [
              new TextRun({
                text: '3. DRIVER & DRIVING LICENCE DETAILS',
                bold: true,
                size: 22,
                font: 'Arial',
                color: '0F172A'
              })
            ]
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow('Driver Name', '{{driver_name}}', 'Licence Number', '{{dl_no}}'),
              createRow('Licence Validity', '{{dl_validity}}', 'Class Allowed', '{{dl_type}}')
            ]
          }),
          new Paragraph({ text: '' }),

          // Section 4: Damage & Loss Assessment
          new Paragraph({
            children: [
              new TextRun({
                text: '4. SURVEY OBSERVATIONS & DAMAGE ASSESSMENT',
                bold: true,
                size: 22,
                font: 'Arial',
                color: '0F172A'
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Damage Summary: ',
                bold: true,
                size: 20,
                font: 'Arial'
              }),
              new TextRun({
                text: '{{damage_summary}}',
                size: 20,
                font: 'Arial'
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Assessment Status: ',
                bold: true,
                size: 20,
                font: 'Arial'
              }),
              new TextRun({
                text: '{{assessment_status}}',
                size: 20,
                font: 'Arial',
                color: '16A34A',
                bold: true
              })
            ]
          }),
          new Paragraph({ text: '' }),

          // Section 5: Surveyor Declaration
          new Paragraph({
            children: [
              new TextRun({
                text: '5. SURVEYOR DECLARATION',
                bold: true,
                size: 22,
                font: 'Arial',
                color: '0F172A'
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'I hereby declare that I have physically inspected the above detailed vehicle. The particulars entered herein have been verified from the original/scanned Registration Certificate, Driving Licence, and Insurance policy documents provided. The assessed damages correlate with the stated cause of accident and are fair and equitable without any conflict of interest.',
                size: 18,
                font: 'Arial',
                italics: true,
                color: '475569'
              })
            ]
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow('Surveyor Name', '{{surveyor_name}}', 'IRDA Licence No.', '{{surveyor_license}}'),
              createRow('Report Date', '{{survey_date}}', 'Signature / Seal', '[Verified Digitally]')
            ]
          })
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(TEMPLATES_DIR, 'motor_survey_assessment.docx');
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated template: ${outPath}`);
}

async function buildSpotSurveyReportTemplate() {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }
          }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'MOTOR SPOT SURVEY INSPECTION REPORT',
                bold: true,
                size: 28,
                font: 'Arial',
                color: '047857'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Preliminary Spot Damage Verification Report',
                italics: true,
                size: 20,
                font: 'Arial',
                color: '64748B'
              })
            ]
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow('Case Ref No.', '{{case_number}}', 'Inspection Date', '{{survey_date}}'),
              createRow('Vehicle Reg. No.', '{{vehicle_reg_no}}', 'Make & Model', '{{make_model}}'),
              createRow('Owner Name', '{{owner_name}}', 'Insuring Office', '{{insurance_company}}'),
              createRow('Chassis No.', '{{chassis_no}}', 'Engine No.', '{{engine_no}}'),
              createRow('Policy No.', '{{policy_no}}', 'Claim Ref No.', '{{claim_no}}'),
              createRow('Spot Location', '{{survey_place}}', 'Odometer Run', '{{odometer_reading}}')
            ]
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Immediate Spot Observations:',
                bold: true,
                size: 20,
                font: 'Arial'
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: '{{damage_summary}}',
                size: 20,
                font: 'Arial'
              })
            ]
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createRow('Attending Surveyor', '{{surveyor_name}}', 'Surveyor License', '{{surveyor_license}}')
            ]
          })
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(TEMPLATES_DIR, 'spot_survey_report.docx');
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated template: ${outPath}`);
}

async function main() {
  await buildMotorSurveyAssessmentTemplate();
  await buildSpotSurveyReportTemplate();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
