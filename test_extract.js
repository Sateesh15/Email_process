const parser = require('./services/resumeParser.js');

const text = `

• 4.3 years of experience in SAP ISU Billing and SAP FICA Testing and SAP 
ISU Testing . 
• Currently working as Test Consultant at Inu Technology Solutions. 
• Involved in the various stages of Software testing life cycle. 
• Extensive hands-on experience in SAP ISU Billing & Invoicing, Dunning, 
Manual Testing and API Testing. 
 
 
PROFILE 
To   perceive   a   challenging   career   in   the 
industry   with   an   organization   that   offers 
high-end technical exposure and an 
opportunity  where  I  may  contribute  to  the 
growth of the organization and myself. 
 
CONTACT 
PHONE: 8466933580 
 
EMAIL: illapriyanka52@gmail.com 
 
KEY COMPETENCIES AND SKILLS 
• Skills: Manual testing, SAP ISU Billing & 
Invoicing, SAP ISU FICA. 
• Tools: Postman, Jira, SAP GUI for 
PRIYANKA.I 
Test Engineer 
 
 EXPERIENCE SUMMARY  
`;

const result = parser.extractCandidateInfo(text);
console.log('Extracted name =>', result.name);
console.log('Full candidate =>', JSON.stringify(result, null, 2));
