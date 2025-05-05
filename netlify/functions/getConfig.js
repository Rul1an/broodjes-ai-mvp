exports.handler = async (event, context) => {
    const gcfImageUrl = process.env.GCF_IMAGE_GENERATION_URL;
    const gcfGenerateBroodjeUrl = process.env.GCF_GENERATE_BROODJE_URL;

    if (!gcfImageUrl || !gcfGenerateBroodjeUrl) {
        console.error('[getConfig] Missing GCF_IMAGE_GENERATION_URL or GCF_GENERATE_BROODJE_URL environment variable.');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error: Required GCF URLs not configured.' })
        };
    }

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            gcfImageUrl: gcfImageUrl,
            gcfGenerateBroodjeUrl: gcfGenerateBroodjeUrl
        })
    };
};
