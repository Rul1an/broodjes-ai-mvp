// Serverless function to generate recipes using OpenAI API
const { OpenAI } = require('openai');

// Initialize OpenAI client with API key from environment variable
// The API key will be securely stored in Netlify's environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // Parse the request body
    const body = JSON.parse(event.body);
    const idea = body.idea;

    if (!idea) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No idea provided' }),
      };
    }

    // Construct the prompt for the AI
    const prompt = `
    Genereer een eenvoudig recept voor een broodje gebaseerd op het volgende idee: '${idea}'.
    Beschrijf de benodigde ingrediënten met geschatte hoeveelheden voor één broodje.
    Beschrijf de bereidingsstappen duidelijk en beknopt.
    Houd het recept praktisch en gericht op een snelle bereiding.
    Formatteer het antwoord netjes met duidelijke kopjes voor Ingrediënten en Bereiding.
    `;

    // Call OpenAI API
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        }
      ],
      model: 'gpt-3.5-turbo',
    });

    const recipe = chatCompletion.choices[0].message.content;

    // Return the generated recipe
    return {
      statusCode: 200,
      body: JSON.stringify({ recipe }),
    };
  } catch (error) {
    console.error('Error generating recipe:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate recipe' }),
    };
  }
};