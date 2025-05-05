exports.handler = async (event, context) => {
    const gcfImageUrl = process.env.GCF_IMAGE_GENERATION_URL;
    const gcfGenerateUrl = process.env.GCF_GENERATE_BROODJE_URL;
    const gcfVisualizeUrl = process.env.GCF_VISUALIZE_BROODJE_URL;

    if (!gcfImageUrl || !gcfGenerateUrl || !gcfVisualizeUrl) {
        console.error('Missing required GCF URL environment variables.');
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: {
                    message: 'Server configuration error: Missing GCF URLs.',
                },
            }),
        };
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gcfImageUrl,
            gcfGenerateBroodjeUrl: gcfGenerateUrl,
            gcfVisualizeBroodjeUrl: gcfVisualizeUrl,
        }),
    };
};
