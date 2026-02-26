/**
 * Client ID Generation Utility
 * Generates unique 12-character alphanumeric identifiers
 */

const { db } = require('../database');

// Characters to use for client ID (excluded similar looking characters: 0, O, 1, I, L)
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ID_LENGTH = 12;

/**
 * Generate a random 12-character alphanumeric string
 * @returns {string} Generated client ID
 */
function generateRandomId() {
    let result = '';
    for (let i = 0; i < ID_LENGTH; i++) {
        result += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
    }
    return result;
}

/**
 * Check if a client ID already exists in the database
 * @param {string} clientId - The client ID to check
 * @returns {Promise<boolean>} True if exists, false otherwise
 */
async function clientIdExists(clientId) {
    try {
        const result = await db.get(
            'SELECT id FROM organizations WHERE client_id = ?',
            [clientId]
        );
        return !!result;
    } catch (error) {
        console.error('Error checking client ID existence:', error);
        // If we can't check, assume it exists to be safe
        return true;
    }
}

/**
 * Generate a unique client ID
 * Retries if collision occurs (up to 10 attempts)
 * @returns {Promise<string>} Unique client ID
 */
async function generateUniqueClientId() {
    const maxAttempts = 10;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const clientId = generateRandomId();
        const exists = await clientIdExists(clientId);
        
        if (!exists) {
            return clientId;
        }
        
        console.log(`Client ID collision detected, retrying... (attempt ${attempt + 1})`);
    }
    
    throw new Error('Failed to generate unique client ID after maximum attempts');
}

/**
 * Validate a client ID format
 * @param {string} clientId - The client ID to validate
 * @returns {boolean} True if valid format
 */
function isValidClientId(clientId) {
    if (!clientId || typeof clientId !== 'string') {
        return false;
    }
    
    // Must be exactly 12 characters
    if (clientId.length !== ID_LENGTH) {
        return false;
    }
    
    // Must only contain valid characters
    const validChars = new Set(CHARSET);
    for (const char of clientId.toUpperCase()) {
        if (!validChars.has(char)) {
            return false;
        }
    }
    
    return true;
}

/**
 * Format client ID with optional separator for display
 * @param {string} clientId - The raw client ID
 * @param {string} separator - Separator to use (default: '-')
 * @returns {string} Formatted client ID (e.g., "ABC-DEF-GHI-JKL")
 */
function formatClientId(clientId, separator = '-') {
    if (!clientId || clientId.length !== ID_LENGTH) {
        return clientId;
    }
    
    // Format as 4 groups of 3 characters
    return clientId.match(/.{1,3}/g).join(separator);
}

/**
 * Normalize client ID (uppercase, remove separators)
 * @param {string} clientId - The client ID to normalize
 * @returns {string} Normalized client ID
 */
function normalizeClientId(clientId) {
    if (!clientId) return '';
    return clientId.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

module.exports = {
    generateUniqueClientId,
    generateRandomId,
    clientIdExists,
    isValidClientId,
    formatClientId,
    normalizeClientId,
    CHARSET,
    ID_LENGTH
};
