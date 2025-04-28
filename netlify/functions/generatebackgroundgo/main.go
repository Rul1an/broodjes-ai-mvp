package main

import (
	"context"
	// "encoding/json"
	"fmt"
	"log"
	"os"
	// "strings"

	// "github.com/joho/godotenv" // For local .env loading
	// supabase "github.com/supabase-community/supabase-go"
	// openai "github.com/sashabaranov/go-openai"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

// // Structure for the incoming request payload (Commented out)
// type RequestPayload struct {
// 	TaskID string `json:"task_id"`
// 	Idea   string `json:"idea"`
// 	Model  string `json:"model"`
// }

// // Structure for updating Supabase task (Commented out)
// type TaskUpdate struct {
// 	Status       string `json:"status"`
// 	Recipe       string `json:"recipe,omitempty"`
// 	ErrorMessage string `json:"error_message,omitempty"`
// }

// var (
// 	supabaseClient *supabase.Client // Commented out
// 	openaiClient   *openai.Client   // Commented out
// )

// func init() { // Commented out init block
// 	// Load .env for local development
// 	godotenv.Load()

// 	// Initialize Supabase Client
// 	supabaseURL := os.Getenv("SUPABASE_URL")
// 	supabaseKey := os.Getenv("SERVICE_ROLE_KEY") // Use service role key
// 	var err error
// 	supabaseClient, err = supabase.NewClient(supabaseURL, supabaseKey, nil)
// 	if err != nil {
// 		fmt.Fprintf(os.Stderr, "[Go Background] Error initializing Supabase client: %v\n", err)
// 	} else if supabaseClient == nil {
// 		fmt.Fprintln(os.Stderr, "[Go Background] Supabase client initialization returned nil, check URL/Key.")
// 	} else {
// 		fmt.Println("[Go Background] Supabase client initialized.")
// 	}

// 	// Initialize OpenAI Client
// 	openaiAPIKey := os.Getenv("OPENAI_API_KEY")
// 	if openaiAPIKey == "" {
// 		fmt.Fprintln(os.Stderr, "[Go Background] Error: OPENAI_API_KEY env var not set.")
// 	} else {
// 		openaiClient = openai.NewClient(openaiAPIKey)
// 		fmt.Println("[Go Background] OpenAI client initialized.")
// 	}
// }

// func updateSupabaseTask(taskID string, updateData TaskUpdate) { // Commented out
// 	if supabaseClient == nil {
// 		fmt.Fprintf(os.Stderr, "[Go Background] Supabase client not available, cannot update task %s\n", taskID)
// 		return
// 	}

// 	// Verwijder de ongebruikte 'data' variabele
// 	_, count, err := supabaseClient.From("async_tasks").
// 		// Updated to provide the three parameters required by Update
// 		Update(updateData, "id", "updated_at").
// 		Eq("task_id", taskID).
// 		Execute()

// 	if err != nil {
// 		fmt.Fprintf(os.Stderr, "[Go Background] CRITICAL: Failed to update task %s status to %s: %v\n", taskID, updateData.Status, err)
// 	} else {
// 		fmt.Printf("[Go Background] Task %s status updated to %s in Supabase. Updated %d records.\n", taskID, updateData.Status, count)
// 	}
// }

func handler(ctx context.Context, request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	// Gebruik log.Printf voor output naar stderr (wat Netlify meestal vangt)
	log.Printf("[Go Background DEBUG] Simplified Handler invoked via log package.")
	log.Printf("[Go Background DEBUG] Request Body: %s\n", request.Body)

	// // Rest van de handler is uitgecommentarieerd
	// fmt.Println("[Go Background] Handler invoked.")

	// if supabaseClient == nil || openaiClient == nil {
	// 	fmt.Fprintln(os.Stderr, "[Go Background] Error: Clients not initialized. Exiting.")
	// 	return &events.APIGatewayProxyResponse{
	// 		StatusCode: 500,
	// 		Body:       `{"error": "Background function clients not initialized."}`,
	// 	}, nil
	// }

	// // 1. Parse Payload
	// var payload RequestPayload
	// err := json.Unmarshal([]byte(request.Body), &payload)
	// if err != nil {
	// 	fmt.Fprintf(os.Stderr, "[Go Background] Error unmarshalling request body: %v\n", err)
	// 	return &events.APIGatewayProxyResponse{StatusCode: 400, Body: `{"error": "Invalid request body"}`}, nil
	// }

	// if payload.TaskID == "" || payload.Idea == "" || payload.Model == "" {
	// 	fmt.Fprintln(os.Stderr, "[Go Background] Error: Missing required fields in payload")
	// 	return &events.APIGatewayProxyResponse{StatusCode: 400, Body: `{"error": "Missing required fields"}`}, nil
	// }

	// fmt.Printf("[Go Background] Processing task %s for idea: '%s'\n", payload.TaskID, payload.Idea)

	// // 2. Call OpenAI
	// prompt := fmt.Sprintf(`...`)

	// resp, err := openaiClient.CreateChatCompletion(...)

	// if err != nil {
	// 	fmt.Fprintf(os.Stderr, "[Go Background] Error calling OpenAI for task %s: %v\n", payload.TaskID, err)
	// 	errorMsg := fmt.Sprintf("Failed during OpenAI call: %v", err)
	// 	// updateSupabaseTask(payload.TaskID, TaskUpdate{Status: "failed", ErrorMessage: errorMsg}) // Commented out
	// 	return &events.APIGatewayProxyResponse{StatusCode: 200, Body: `{"message": "OpenAI call failed, status updated"}`}, nil
	// }

	// recipe := resp.Choices[0].Message.Content

	// // 3. Cleanup response string
	// jsonMarker := "```json"
	// if idx := strings.Index(recipe, jsonMarker); idx != -1 {
	// 	recipe = strings.TrimSpace(recipe[:idx])
	// }

	// fmt.Printf("[Go Background] OpenAI call successful for task %s.\n", payload.TaskID)

	// // 4. Update Supabase Task Record - Success (Commented out)
	// // updateSupabaseTask(payload.TaskID, TaskUpdate{Status: "completed", Recipe: recipe})

	// Stuur altijd een simpele OK terug voor deze test
	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       `{"message": "Simplified Go handler finished successfully."}`,
	}, nil
}

func main() {
	// Zorg ervoor dat GODEBUG env var gezet kan worden indien nodig (voor meer lambda debug info)
	log.SetOutput(os.Stderr) // Stuur logs naar stderr
	lambda.Start(handler)
}
