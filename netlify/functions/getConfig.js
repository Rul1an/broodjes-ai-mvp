exports.handler = async (event, context) => {
    const gcfUrl = process.env.GCF_IMAGE_GENERATION_URL;

    if (!gcfUrl) {
        console.error('[getConfig] Missing GCF_IMAGE_GENERATION_URL environment variable.');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error: GCF URL not configured.' })
        };
    }

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ gcfImageUrl: gcfUrl })
    };
};
