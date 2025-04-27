package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv" // For local .env loading
	supabase "github.com/supabase-community/supabase-go"
	openai "github.com/sashabaranov/go-openai"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

// Structure for the incoming request payload
type RequestPayload struct {
	TaskID string `json:"task_id"`
	Idea   string `json:"idea"`
	Model  string `json:"model"`
}

// Structure for updating Supabase task
type TaskUpdate struct {
	Status       string `json:"status"`
	Recipe       string `json:"recipe,omitempty"`
	ErrorMessage string `json:"error_message,omitempty"`
}

var (
	supabaseClient *supabase.Client
	openaiClient   *openai.Client
)

func init() {
	// Load .env for local development
	godotenv.Load()

	// Initialize Supabase Client
	supabaseURL := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY") // Use service role key
	var err error
	supabaseClient, err = supabase.NewClient(supabaseURL, supabaseKey, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[Go Background] Error initializing Supabase client: %v\n", err)
	} else if supabaseClient == nil {
		fmt.Fprintln(os.Stderr, "[Go Background] Supabase client initialization returned nil, check URL/Key.")
	} else {
		fmt.Println("[Go Background] Supabase client initialized.")
	}

	// Initialize OpenAI Client
	openaiAPIKey := os.Getenv("OPENAI_API_KEY")
	if openaiAPIKey == "" {
		fmt.Fprintln(os.Stderr, "[Go Background] Error: OPENAI_API_KEY env var not set.")
	} else {
		openaiClient = openai.NewClient(openaiAPIKey)
		fmt.Println("[Go Background] OpenAI client initialized.")
	}
}

func updateSupabaseTask(taskID string, updateData TaskUpdate) {
	if supabaseClient == nil {
		fmt.Fprintf(os.Stderr, "[Go Background] Supabase client not available, cannot update task %s\n", taskID)
		return
	}

	// Updated to handle the three return values from Execute
	data, count, err := supabaseClient.From("async_tasks").
		// Updated to provide the three parameters required by Update
		Update(updateData, "id", "updated_at").
		Eq("task_id", taskID).
		Execute()

	if err != nil {
		fmt.Fprintf(os.Stderr, "[Go Background] CRITICAL: Failed to update task %s status to %s: %v\n", taskID, updateData.Status, err)
	} else {
		fmt.Printf("[Go Background] Task %s status updated to %s in Supabase. Updated %d records.\n", taskID, updateData.Status, count)
	}
}

func handler(ctx context.Context, request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	fmt.Println("[Go Background] Handler invoked.")

	if supabaseClient == nil || openaiClient == nil {
		fmt.Fprintln(os.Stderr, "[Go Background] Error: Clients not initialized. Exiting.")
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       `{"error": "Background function clients not initialized."}`, // Use backticks for raw string
		}, nil // Return nil error for Lambda handler
	}

	// 1. Parse Payload
	var payload RequestPayload
	err := json.Unmarshal([]byte(request.Body), &payload)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[Go Background] Error unmarshalling request body: %v\n", err)
		// Cannot update Supabase without task ID
		return &events.APIGatewayProxyResponse{StatusCode: 400, Body: `{"error": "Invalid request body"}`}, nil
	}

	if payload.TaskID == "" || payload.Idea == "" || payload.Model == "" {
		fmt.Fprintln(os.Stderr, "[Go Background] Error: Missing required fields in payload")
		// Cannot update Supabase without task ID
		return &events.APIGatewayProxyResponse{StatusCode: 400, Body: `{"error": "Missing required fields"}`}, nil
	}

	fmt.Printf("[Go Background] Processing task %s for idea: '%s'\n", payload.TaskID, payload.Idea)

	// 2. Call OpenAI
	prompt := fmt.Sprintf(`
        Genereer een eenvoudig recept voor een broodje gebaseerd op het volgende idee: '%s'.
        Beschrijf de benodigde ingrediënten met geschatte hoeveelheden voor één broodje.
        Beschrijf de bereidingsstappen duidelijk en beknopt.
        Houd het recept praktisch en gericht op een snelle bereiding.
        Formatteer het antwoord netjes met duidelijke kopjes voor Ingrediënten en Bereiding.
        Bevat GEEN json block aan het einde van je antwoord.
        `, payload.Idea)

	resp, err := openaiClient.CreateChatCompletion(
		context.Background(),
		openai.ChatCompletionRequest{
			Model: payload.Model,
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleUser,
					Content: prompt,
				},
			},
		},
	)

	if err != nil {
		fmt.Fprintf(os.Stderr, "[Go Background] Error calling OpenAI for task %s: %v\n", payload.TaskID, err)
		errorMsg := fmt.Sprintf("Failed during OpenAI call: %v", err)
		updateSupabaseTask(payload.TaskID, TaskUpdate{Status: "failed", ErrorMessage: errorMsg})
		// Return 200 OK for the handler itself, failure is recorded in DB
		return &events.APIGatewayProxyResponse{StatusCode: 200, Body: `{"message": "OpenAI call failed, status updated"}`}, nil
	}

	recipe := resp.Choices[0].Message.Content

	// 3. Cleanup response string
	jsonMarker := "```json"
	if idx := strings.Index(recipe, jsonMarker); idx != -1 {
		recipe = strings.TrimSpace(recipe[:idx])
	}

	fmt.Printf("[Go Background] OpenAI call successful for task %s.\n", payload.TaskID)

	// 4. Update Supabase Task Record - Success
	updateSupabaseTask(payload.TaskID, TaskUpdate{Status: "completed", Recipe: recipe})

	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       `{"message": "Background handler finished successfully."}`, // Raw string
	}, nil
}

func main() {
	// Make the handler available for AWS Lambda
	lambda.Start(handler)
}
