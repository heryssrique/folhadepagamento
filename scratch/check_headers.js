const XLSX = require('xlsx');
const path = require('path');

const files = [
    'Modelos/FolhaAnalitica 032026.xlsx',
    'Modelos/valores de grrf 032026.xlsx',
    'Modelos/bases concreta.xlsx'
];

files.forEach(file => {
    const filePath = path.join('c:/Users/hhsil/OneDrive/Documentos/folhadepagamento', file);
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const headers = data[0] || [];
        console.log(`\n--- ${file} ---`);
        console.log('Headers:', headers.join(' | '));
        // Print first few rows to check for data structure if needed
        // console.log('Sample Row:', data[1] ? data[1].join(' | ') : 'No data');
    } catch (e) {
        console.error(`Error reading ${file}:`, e.message);
    }
});
