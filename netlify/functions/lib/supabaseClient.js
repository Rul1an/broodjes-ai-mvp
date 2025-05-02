const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let serviceClient = null;
let anonClient = null;

function getServiceClient() {
    if (!serviceClient) {
        if (supabaseUrl && supabaseServiceKey) {
            serviceClient = createClient(supabaseUrl, supabaseServiceKey);
            console.log('Supabase Service Client Initialized.');
        } else {
            console.error('CRITICAL: Missing SUPABASE_URL or SERVICE_ROLE_KEY.');
            return null;
        }
    }
    return serviceClient;
}

function getAnonClient() {
    if (!anonClient) {
        if (supabaseUrl && supabaseAnonKey) {
            anonClient = createClient(supabaseUrl, supabaseAnonKey);
            console.log('Supabase Anon Client Initialized.');
        } else {
            console.error('CRITICAL: Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
            return null;
        }
    }
    return anonClient;
}

module.exports = { getServiceClient, getAnonClient };
