// Serverless function to start the background recipe generation task
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

exports.handler = async function (event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    let body;
    try {
        // Parse and validate request body
        if (!event.body) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Request body is missing.' }) };
        }
        body = JSON.parse(event.body);

        const idea = body.idea;
        const requestedModel = body.model || 'gpt-3.5-turbo'; // Default model

        // Validate idea input
        if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Parameter "idea" must be a non-empty string.' }),
            };
        }

        // Validate model input
        const allowedModels = ['gpt-3.5-turbo', 'gpt-4o'];
        if (!allowedModels.includes(requestedModel)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: `Unsupported model: ${requestedModel}` }),
            };
        }

        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SERVICE_ROLE_KEY;

        // DEBUG LOGGING: Removed after confirming the issue
        // console.log('DEBUG: Received SUPABASE_URL:', supabaseUrl ? 'Set' : 'Not Set or Empty');
        // console.log('DEBUG: Received SERVICE_ROLE_KEY:', supabaseKey ? 'Set (length: ' + supabaseKey.length + ')' : 'Not Set or Empty');
        // console.log('DEBUG: Service Key starts with:', supabaseKey ? supabaseKey.substring(0, 5) : 'N/A');

        if (!supabaseUrl || !supabaseKey) {
            console.error('Supabase URL or SERVICE_ROLE_KEY missing in generate-start function');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Generate a unique task ID for this job
        const taskId = uuidv4();

        // Create a task record in Supabase to track status
        const { data, error } = await supabase
            .from('async_tasks')
            .insert([{
                task_id: taskId,
                idea: idea.trim(),
                model: requestedModel,
                status: 'pending',
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            console.error('Error creating task record in Supabase:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to create task record' })
            };
        }

        // Haal de basis URL van de site op uit de environment variabelen
        const siteUrl = process.env.URL;
        if (!siteUrl) {
            console.error('Site URL (process.env.URL) is not set. Cannot invoke background function.');
            // We kunnen de taak nog steeds aanmaken, maar de achtergrondfunctie wordt niet aangeroepen.
            // Overweeg hier eventueel een 500 error terug te geven als de background call essentieel is.
        }

        // Roep de nieuwe Node.js background functie aan
        const backgroundFunctionPath = '/.netlify/functions/generatebackgroundnode';
        const absoluteBackgroundUrl = siteUrl ? `${siteUrl}${backgroundFunctionPath}` : null;

        // Invoke the background task asynchronously
        /* // Start uitcommentariëren van fetch blok
        if (absoluteBackgroundUrl) { // Gebruik de absolute URL
            fetch(absoluteBackgroundUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    task_id: taskId,
                    idea: idea.trim(),
                    model: requestedModel
                })
            }).catch(err => {
                // Log de error, maar blokkeer de response niet
                console.error(`Error invoking background function ${absoluteBackgroundUrl}:`, err);
            });
        } else {
            console.error('Could not invoke background function because site URL is missing.');
        }
        */ // Einde uitcommentariëren van fetch blok

        // Return success with the task ID immediately
        return {
            statusCode: 202, // Accepted
            body: JSON.stringify({
                message: 'Recipe generation started',
                task_id: taskId
            })
        };

    } catch (error) {
        console.error('Error in generate-start function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error while processing request' })
        };
    }
};
