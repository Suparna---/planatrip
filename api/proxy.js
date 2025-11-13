// api/proxy.js
// This is a serverless function that will act as a secure proxy to the Google AI API.

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    // Securely get the API key from environment variables
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        res.status(500).json({ error: 'API key is not configured on the server.' });
        return;
    }

    // This v1beta endpoint and model name is correct.
    const API_URL_BASE = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent`;
    
    const apiUrl = `${API_URL_BASE}?key=${API_KEY}`;

    const { type, ...body } = req.body;
    let payload;

    // Based on the 'type' from the frontend, construct the correct payload
    switch (type) {
        case 'itinerary':
            const data = body.data;
            
            const prompt = `
You are an AI travel assistant. Your task is to generate a travel itinerary based on the user's request.
You MUST format your response *strictly* according to the provided JSON schema.
Do not add any text, conversational chat, or markdown outside of the final JSON structure.

User Request:
- Destination: ${data.cities}, ${data.country}
- Staying At (Starting Point): ${data['staying-at'] || 'Central location'} 
- Duration: ${data.duration} days
- Travelers: ${data['num-people']}
- Budget: ${data.budget}
- Pace: ${data['trip-pace']}
- Accommodation: ${data['accommodation-type']}
- Interests: ${data.interests || 'N/A'}

IMPORTANT INSTRUCTION:
If "Staying At" is specific (not 'Central location'), you MUST assume the user starts their day there. 
Optimise the daily order of activities to minimize travel time from that starting point.

JSON Schema Instructions:
1.  **title**: Generate a concise, catchy title for the trip (e.g., "3-Day Foodie Tour of Rome").
2.  **summary**: Write a 2-3 sentence summary of the trip.
3.  **budgetTier**: Use the user's requested budget (e.g., "${data.budget}").
4.  **numberOfPeople**: Use the user's requested number (e.g., ${data['num-people']}).
5.  **costPerHeadUSD**: Estimate a reasonable cost per person in USD (number only).
6.  **bestSeasonToVisit**: Suggest the best season to visit (e.g., "Spring (April-June)").
7.  **days**: Create an array for each day.
8.  **day object**: Each day *must* have a "day" number, "theme", "city", "transportation_tip", and an "activities" array.
9.  **activity object**: Each activity *must* have a "name", "type","details", "address", "approxCostUSD", and "crowdLevel" (Low, Moderate, or High).

IMPORTANT: Your entire response must be ONLY the JSON object, starting with { and ending with }.
`;

            payload = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    // This is the fix for the intermittent "bold" bug.
                    "temperature": 0.1,
                    
                    responseMimeType: "application/json",
                    responseSchema: { 
                        type: "OBJECT", 
                        properties: { 
                            title: { type: "STRING" }, 
                            numberOfPeople: { type: "NUMBER" }, 
                            budgetTier: { type: "STRING" }, 
                            costPerHeadUSD: { type: "NUMBER" }, 
                            summary: { type: "STRING" }, 
                            bestSeasonToVisit: { type: "STRING" }, 
                            days: { 
                                type: "ARRAY", 
                                items: { 
                                    type: "OBJECT", 
                                    properties: { 
                                        day: { type: "NUMBER" }, 
                                        theme: { type: "STRING" }, 
                                        city: { type: "STRING" }, 
                                        transportation_tip: { type: "STRING" }, 
                                        activities: { 
                                            type: "ARRAY", 
                                            items: { 
                                                type: "OBJECT", 
                                                properties: { 
                                                    name: { type: "STRING" }, 
                                                    type: { type: "STRING" }, 
                                                    crowdLevel: { type: "STRING" }, 
                                                    approxCostUSD: { type: "NUMBER" }, 
                                                    details: { type: "STRING" }, 
                                                    address: { type: "STRING" } 
                                                },
                                                required: ["name", "type", "details", "approxCostUSD", "crowdLevel", "address"]
                                            } 
                                        } 
                                    }, 
                                    required: ["day", "theme", "city", "activities", "transportation_tip"] 
                                } 
                            } 
                        },
                        // This forces the AI to return all fields, not just the title.
                        required: [
                            "title", 
                            "numberOfPeople", 
                            "budgetTier", 
                            "costPerHeadUSD", 
                            "summary", 
                            "bestSeasonToVisit", 
                            "days"
                        ]
                    }
                }
            };
            break;
        
        case 'groundedSearch':
            payload = {
                contents: [{ parts: [{ text: body.query }] }],
                tools: [{ "google_search": {} }]
            };
            break;

        case 'contextualQa':
            const { context, question } = body;
            const qaPrompt = `Regarding the travel activity or location "${context}", please provide a concise and helpful answer to the following user question: "${question}"`;
            payload = {
                contents: [{ parts: [{ text: qaPrompt }] }],
                tools: [{ "google_search": {} }]
            };
            break;
            
        case 'flights':
            const flightData = body.data;
            const flightPrompt = `Find the cheapest flight options from ${flightData['flight-origin']} to ${flightData['flight-destination']}, departing on ${flightData['flight-depart-date']}${flightData['flight-return-date'] ? ` and returning on ${flightData['flight-return-date']}` : ''} for ${flightData['flight-travelers']} traveler(s) in ${flightData['flight-cabin']} class. Summarize the best 2-3 options. IMPORTANT: Make sure all airline names are enclosed in asterisks to make them bold, for example **IndiGo** or **SriLankan Airlines**.`;
            payload = {
                contents: [{ parts: [{ text: flightPrompt }] }],
                tools: [{ "google_search": {} }]
            };
            break;

        case 'packingList':
            const packData = body.data;
            const packPrompt = `Generate a detailed packing list for a trip to ${packData['pack-destination']} for ${packData['pack-duration']} days, during the ${packData['pack-season']}. Special activities include: ${packData['pack-activities']}. Format the output as a Markdown list.`;
            
            payload = { contents: [{ parts: [{ text: packPrompt }] }] };
            break;

        case 'currency':
            const currencyPrompt = `What is the current exchange rate for ${body.amount} ${body.from} to ${body.to}? Just give the final converted number and the currency code.`;
            payload = {
                contents: [{ parts: [{ text: currencyPrompt }] }],
                tools: [{ "google_search": {} }]
            };
            break;

        default:
            res.status(400).json({ error: 'Invalid API request type' });
            return;
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to fetch from Gemini API');
        }

        const result = await response.json();

        if (type === 'itinerary') {
            try {
                const jsonText = result.candidates[0].content.parts[0].text;
                const parsedJson = JSON.parse(jsonText);
                res.status(200).json(parsedJson);
            } catch (parseError) {
                console.error("Failed to parse itinerary JSON from model:", parseError);
                console.error("Original text from model:", result.candidates[0]?.content?.parts[0]?.text);
                res.status(500).json({ error: "The AI failed to generate a valid itinerary format. Please try again." });
            }
        } else {
            res.status(200).json(result);
        }
    } catch (error) {
        console.error("Error in serverless function:", error);
        res.status(500).json({ error: error.message });
    }
}