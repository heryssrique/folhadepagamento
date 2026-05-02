const XLSX = require('xlsx');
const fs = require('fs');

const file = 'c:\\Users\\hhsil\\OneDrive\\Documentos\\folhadepagamento\\Modelos\\4\\BASES JPL 032026.xlsx';
const workbook = XLSX.readFile(file);

const result = {};
workbook.SheetNames.forEach(name => {
    const ws = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    result[name] = {
        rowCount: data.length,
        headers: data[0] || [],
        sampleRow: data[1] || []
    };
});

fs.writeFileSync('c:\\Users\\hhsil\\OneDrive\\Documentos\\folhadepagamento\\Modelos\\4\\inspect_results.json', JSON.stringify(result, null, 2));
console.log('Inspection complete');
