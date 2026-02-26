/**
 * Table Usage Analyzer
 * Scans codebase to find which tables are actually being used
 * 
 * Usage: node backend/scripts/analyze-table-usage.js
 */

const fs = require('fs');
const path = require('path');

// Tables defined in schema
const schemaTables = [
    'users',
    'organizations',
    'organization_members',
    'boards',
    'board_members',
    'committees',
    'committee_members',
    'subscription_plans',
    'activity_logs',
    'document_folders',
    'documents',
    'notifications',
    'audit_log'
];

// Scan backend JS files for table references
function scanCodebase() {
    const backendDir = path.join(__dirname, '..');
    const results = {};
    
    schemaTables.forEach(table => {
        results[table] = {
            queries: [],
            count: 0
        };
    });
    
    function scanFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        schemaTables.forEach(table => {
            // Look for table references
            const patterns = [
                new RegExp(`query\\(['"]${table}['"]`, 'g'),
                new RegExp(`from\\s+['"]${table}['"]`, 'g'),
                new RegExp(`insert\\(['"]${table}['"]`, 'g'),
                new RegExp(`update\\(['"]${table}['"]`, 'g'),
                new RegExp(`delete\\(['"]${table}['"]`, 'g'),
                new RegExp(`db\\.get\\(['"]SELECT.*FROM\\s+${table}`, 'gi'),
                new RegExp(`db\\.all\\(['"]SELECT.*FROM\\s+${table}`, 'gi'),
                new RegExp(`db\\.run\\(['"]INSERT\\s+INTO\\s+${table}`, 'gi'),
                new RegExp(`db\\.run\\(['"]UPDATE\\s+${table}`, 'gi'),
                new RegExp(`db\\.run\\(['"]DELETE\\s+FROM\\s+${table}`, 'gi')
            ];
            
            patterns.forEach(pattern => {
                const matches = content.match(pattern);
                if (matches) {
                    results[table].count += matches.length;
                    results[table].queries.push(`${path.basename(filePath)}: ${matches.length} references`);
                }
            });
        });
    }
    
    function walkDir(dir) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory() && file !== 'node_modules') {
                walkDir(filePath);
            } else if (file.endsWith('.js')) {
                scanFile(filePath);
            }
        });
    }
    
    walkDir(backendDir);
    return results;
}

// Main analysis
console.log('🔍 Analyzing Table Usage in Codebase\n');
console.log('=' .repeat(60));

const usage = scanCodebase();

console.log('\n📊 TABLE USAGE SUMMARY\n');
console.log('-'.repeat(60));
console.log(`${'Table Name'.padEnd(30)} | ${'Usage Count'.padEnd(12)} | Status`);
console.log('-'.repeat(60));

schemaTables.forEach(table => {
    const count = usage[table].count;
    const status = count > 0 ? '✅ USED' : '⚠️  UNUSED';
    console.log(`${table.padEnd(30)} | ${String(count).padEnd(12)} | ${status}`);
});

console.log('\n' + '='.repeat(60));
console.log('\n📁 DETAILED USAGE BY FILE:\n');

schemaTables.forEach(table => {
    if (usage[table].count > 0) {
        console.log(`\n${table.toUpperCase()} (${usage[table].count} references):`);
        usage[table].queries.forEach(q => console.log(`  - ${q}`));
    }
});

console.log('\n' + '='.repeat(60));
console.log('\n💡 RECOMMENDATIONS:\n');

const unusedTables = schemaTables.filter(t => usage[t].count === 0);
if (unusedTables.length > 0) {
    console.log('Tables with NO usage detected (may be safe to drop):');
    unusedTables.forEach(t => console.log(`  - ${t}`));
} else {
    console.log('All tables appear to be in use.');
}

console.log('\n⚠️  WARNING: Review carefully before dropping any tables!');
console.log('Some tables may be used in SQL queries that were not detected.');
