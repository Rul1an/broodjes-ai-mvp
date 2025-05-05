exports.handler = async (event, context) => {
    const GCF_IMAGE_GENERATION_URL = process.env.GCF_IMAGE_GENERATION_URL;
    const functionName = 'testGcfConnection';

    console.log(`--- ${functionName} handler started ---`);

    if (!GCF_IMAGE_GENERATION_URL) {
        console.error(`[${functionName}] Missing GCF_IMAGE_GENERATION_URL environment variable.`);
        return { statusCode: 500, body: JSON.stringify({ error: 'Server config error' }) };
    }

    console.log(`[${functionName}] Attempting fetch (GET) to: ${GCF_IMAGE_GENERATION_URL}`);

    try {
        const response = await fetch(GCF_IMAGE_GENERATION_URL, { method: 'GET' });
        console.log(`[${functionName}] Fetch completed. Status: ${response.status}`);
        const responseText = await response.text(); // Read body to ensure connection closes cleanly
        console.log(`[${functionName}] Response Body (first 100 chars): ${responseText.substring(0, 100)}`);

        // We expect a 405 Method Not Allowed from the GCF for a GET request
        return {
            statusCode: 200, // Return 200 OK from *this* function if fetch completes
            body: JSON.stringify({
                message: `Fetch attempt completed. GCF responded with status ${response.status}. Expected 405 (Method Not Allowed).`,
                gfc_response_status: response.status,
                gfc_response_body_start: responseText.substring(0, 100)
            })
        };
    } catch (error) {
        console.error(`[${functionName}] Error during fetch:`, error);
        return {
            statusCode: 500, // Return 500 from *this* function if fetch fails
            body: JSON.stringify({ error: 'Fetch failed', details: error.message, stack: error.stack })
        };
    }
};
