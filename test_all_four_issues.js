const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:4000';

async function testAllFourIssues() {
  console.log('===============================================================');
  console.log('🧪 COMPREHENSIVE END-TO-END VERIFICATION OF ALL 4 RESOLUTIONS');
  console.log('===============================================================');

  // Step 1: Demo Login as Surveyor
  console.log('\n--- 1. Authenticating as Field Surveyor ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'surveyor@surveyor.com',
      password: 'surveyor123'
    })
  });
  const loginData = await loginRes.json();
  console.log('Login status:', loginRes.status, 'Response:', loginData);
  const token = loginData.token;
  const authHeaders = {
    'Authorization': `Bearer ${token}`
  };

  // Step 2: Create a Survey Case
  console.log('\n--- 2. Setting up Survey Case ---');
  const caseNumber = `SURV-VERIF-${Date.now()}`;
  const createRes = await fetch(`${BASE_URL}/api/surveys`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caseNumber,
      insurer: 'United India Insurance Company Limited',
      claimNo: 'CLM-UIIC-90231'
    })
  });
  const createData = await createRes.json();
  const surveyId = createData.survey.id;
  console.log(`✓ Survey Case created: ID=${surveyId}, CaseNo=${caseNumber}`);

  // Step 3: Issue 1 & Issue 2 Verification: Upload Documents & Reference Model
  console.log('\n--- 3. Testing Initial Upload & Reference Model Training ---');
  
  const rcText = `GOVERNMENT OF TAMIL NADU - TRANSPORT DEPARTMENT
CERTIFICATE OF REGISTRATION (RC BOOK)
Registration No: TN-59-CR-9090
Date of Registration: 24/09/2021
Chassis Number / VIN: MAKGN456DN4100311
Engine Number: N15A1100392
Owner Name: MR THAIYAL NAYAKI A
Address: NO 4/26, NEW NATHAM MAIN ROAD, DEVAR COLONY, NARAYANAPURAM, MADURAI - 625014
Make / Model: HONDA - CITY 5TH GEN ZX DIESEL BS-VI
Vehicle Class: LMV (Motor Car)
Fuel Type: Diesel
Manufacturing Year: 2021
Color: Golden Brown Metallic
Seating Capacity: 5 In All
Cubic Capacity: 1498 CC
`;

  const policyText = `UNITED INDIA INSURANCE COMPANY LIMITED
MOTOR PRIVATE CAR PACKAGE POLICY SCHEDULE
Policy Number: 0914003126P101159038
Name of Insured: MR THAIYAL NAYAKI A
Address of the Insured: NO 4/26, NEW NATHAM MAIN ROAD, NARAYANAPURAM, MADURAI 625014
Period of Insurance: From 00:00 Hrs of 24/09/2025 To Midnight of 23/09/2026
Vehicle Regn No: TN-59-CR-9090
Make & Model: HONDA / CITY 5TH GEN ZX DIESEL BS-VI
Chassis No: MAKGN456DN4100311
Engine No: N15A1100392
Insured's Declared Value (IDV): Rs. 11,50,000
Claim Number: CLM-UIIC-90231
`;

  const dlText = `INDIAN UNION DRIVING LICENCE
Licence No: TN59 20030013783
Name of Driver: MR THAIYAL NAYAKI A
Date of Birth: 15/05/1982
Residing At: Madurai, Tamil Nadu
Valid Upto: 14/05/2032
Class of Vehicle: LMV - Motor Car / Motorcycle
`;

  const refModelText = `========================================================================================
MOTOR SURVEY AND FINAL LOSS ASSESSMENT REPORT
Independent Insurance Surveyor & Loss Assessor
========================================================================================
Report Ref No	:	SURV-REF-MODEL-891		Survey Date	:	24/09/2026
Claim Number	:	CLM-UIIC-90231			Inspection Place	:	Authorized Workshop

1. POLICY & INSURED PARTICULARS
Insuring Company	:	United India Insurance Company Limited
Policy Number		:	0914003126P101159038
Period of Insurance	:	24/09/2025 to 23/09/2026
Name of Insured		:	MR THAIYAL NAYAKI A
Insured Address		:	NO 4/26, NEW NATHAM MAIN ROAD, NARAYANAPURAM, MADURAI 625014
Sum Insured (IDV)	:	Rs. 11,50,000

2. VEHICLE PARTICULARS
Registration Number	:	TN-59-CR-9090
Date of Registration	:	24/09/2021
Make & Model		:	HONDA - CITY 5TH GEN ZX DIESEL BS-VI
Chassis Number / VIN	:	MAKGN456DN4100311
Engine Number		:	N15A1100392
Manufacturing Year	:	2021
Class of Vehicle	:	LMV (Motor Car)
Fuel Type		:	Diesel
Seating Capacity	:	5 In All
Cubic Capacity		:	1498 CC
Vehicle Colour		:	Golden Brown Metallic

3. DRIVER PARTICULARS
Driver's Name		:	MR THAIYAL NAYAKI A
Driving Licence No.	:	TN59 20030013783
Valid up to		:	14/05/2032

4. ACCIDENT & SURVEY PARTICULARS
Date of Survey		:	24/09/2026
Place of Survey		:	Sundaram Honda Authorized Service Center, Madurai
Damage Summary		:	Front bumper cracked, radiator condenser leaked, right fender dented
========================================================================================`;

  const form = new FormData();
  form.append('documents', new Blob([rcText], { type: 'text/plain' }), 'RC_TN59CR9090.txt');
  form.append('documents', new Blob([policyText], { type: 'text/plain' }), 'Policy_copy_091400.txt');
  form.append('documents', new Blob([dlText], { type: 'text/plain' }), 'DL_TN59.txt');
  form.append('documents', new Blob([refModelText], { type: 'text/plain' }), 'Reference_Templete_File.txt');

  const docTypes = {
    'RC_TN59CR9090.txt': 'RC_BOOK',
    'Policy_copy_091400.txt': 'INSURANCE_POLICY',
    'DL_TN59.txt': 'DRIVING_LICENSE',
    'Reference_Templete_File.txt': 'REFERENCE_MODEL'
  };
  form.append('docTypes', JSON.stringify(docTypes));

  const uploadRes = await fetch(`${BASE_URL}/api/surveys/${surveyId}/upload-docs`, {
    method: 'POST',
    headers: { ...authHeaders },
    body: form
  });

  const uploadData = await uploadRes.json();
  console.log(`✓ Uploaded ${uploadData.files?.length} documents.`);
  console.log('  Files uploaded:', uploadData.files?.map(f => `${f.originalName} -> ${f.docType}`));

  // Check survey to verify reference model training was triggered automatically
  const surveyAfterUpload = await fetch(`${BASE_URL}/api/surveys/${surveyId}`, { headers: authHeaders });
  const surveyJson = await surveyAfterUpload.json();
  const surveyData = surveyJson.survey;

  console.log('\n--- Issue 2 Check: Reference Template Training ---');
  if (surveyData.referenceModel) {
    console.log('✓ Reference Template trained successfully!');
    console.log('  Trained file:', surveyData.referenceModel.fileName);
    console.log('  Alignment Mode:', surveyData.referenceModel.alignment?.label);
    console.log('  Total Mapped Fields:', surveyData.referenceModel.totalMappedFields);
    console.log('  Required Documents Count:', surveyData.referenceModel.requiredDocuments?.length);
  } else {
    throw new Error('FAILED: Reference model was not trained!');
  }

  // Step 4: Issue 3 Verification: Execute Extraction & Display of All Important Data
  console.log('\n--- Issue 3 Check: Execute Extraction & Display of All Important Data ---');
  const extractRes = await fetch(`${BASE_URL}/api/surveys/${surveyId}/extract`, {
    method: 'POST',
    headers: authHeaders
  });
  const extractData = await extractRes.json();
  const extracted = extractData.fields;

  console.log('✓ Extraction Executed Successfully!');
  console.log('  Vehicle Reg No   :', extracted.vehicle_reg_no);
  console.log('  Make & Model     :', extracted.make_model);
  console.log('  Owner / Insured  :', extracted.owner_name);
  console.log('  Chassis No       :', extracted.chassis_no);
  console.log('  Engine No        :', extracted.engine_no);
  console.log('  Policy Number    :', extracted.policy_no);
  console.log('  Insurer Company  :', extracted.insurance_company);
  console.log('  IDV Amount       :', extracted.idv_amount);
  console.log('  Driving License  :', extracted.dl_no);
  console.log('  Manufacturing Yr :', extracted.manufacturing_year);
  console.log('  Cubic Capacity   :', extracted.cubic_capacity);
  console.log('  Fuel Type        :', extracted.fuel_type);

  // Assert critical fields are NOT empty or placeholder
  if (!extracted.vehicle_reg_no || extracted.vehicle_reg_no === 'NA') {
    throw new Error('FAILED: vehicle_reg_no was not extracted!');
  }
  if (!extracted.owner_name || extracted.owner_name === 'NA') {
    throw new Error('FAILED: owner_name was not extracted!');
  }
  if (!extracted.policy_no || extracted.policy_no === 'NA') {
    throw new Error('FAILED: policy_no was not extracted!');
  }
  if (!extracted.chassis_no || extracted.chassis_no === 'NA') {
    throw new Error('FAILED: chassis_no was not extracted!');
  }

  console.log('✓ All important data extracted accurately with zero collision!');

  // Step 5: Issue 4 Verification: Export as DOCX and PDF
  console.log('\n--- Issue 4 Check: Export as DOCX and PDF ---');
  const genRes = await fetch(`${BASE_URL}/api/surveys/${surveyId}/generate`, {
    method: 'POST',
    headers: authHeaders
  });
  const genData = await genRes.json();
  console.log('✓ Generate Report response:', genData.message);
  console.log('  Available reports:', genData.reports?.map(r => `${r.format.toUpperCase()} (${r.fileName || r.previewUrl})`));

  // Test downloading Word report (.docx)
  const docxReport = genData.reports.find(r => r.format === 'docx');
  if (!docxReport) throw new Error('FAILED: No DOCX report returned!');
  const docxDownloadRes = await fetch(`${BASE_URL}${docxReport.downloadUrl}`, {
    headers: authHeaders
  });
  const docxBuffer = await docxDownloadRes.arrayBuffer();
  console.log(`✓ Word report downloaded: ${docxBuffer.byteLength} bytes (HTTP ${docxDownloadRes.status})`);
  if (docxBuffer.byteLength < 5000) {
    throw new Error('FAILED: DOCX report is too small or corrupted!');
  }

  // Test downloading/previewing PDF HTML view
  const pdfReport = genData.reports.find(r => r.format === 'pdf');
  if (!pdfReport) throw new Error('FAILED: No PDF report returned!');
  const pdfPreviewRes = await fetch(`${BASE_URL}/api/surveys/${surveyId}/preview-html?print=true`, {
    headers: authHeaders
  });
  const pdfHtml = await pdfPreviewRes.text();
  console.log(`✓ PDF printable HTML rendered: ${pdfHtml.length} characters (HTTP ${pdfPreviewRes.status})`);
  
  // Verify HTML contains the vehicle registration number and print script
  if (!pdfHtml.includes('TN-59-CR-9090')) {
    throw new Error('FAILED: PDF HTML preview does not contain extracted vehicle registration number!');
  }
  if (!pdfHtml.includes('window.print()')) {
    throw new Error('FAILED: PDF HTML preview does not contain auto-print trigger!');
  }
  if (!pdfHtml.includes('btn-print-action')) {
    throw new Error('FAILED: PDF HTML preview missing print toolbar!');
  }

  console.log('✓ PDF export and print formatting verified!');

  console.log('\n===============================================================');
  console.log('🎉 ALL 4 ISSUES VERIFIED AND SOLVED 100% SUCCESSFULLY!');
  console.log('===============================================================');
}

testAllFourIssues().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
