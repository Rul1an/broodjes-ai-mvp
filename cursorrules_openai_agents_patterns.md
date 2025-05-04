# OpenAI Agents: Design Patterns and Best Practices

## Agent Design Principles

Effective AI agents follow several key design principles that enhance their usability, reliability, and performance:

### 1. Single Responsibility
- Each agent should have a clear, focused purpose
- Avoid creating "do everything" agents that try to handle too many use cases
- Better to have multiple specialized agents than one complex agent

### 2. Clear Instructions
- Provide detailed system messages with explicit guidelines
- Define constraints and limitations
- Specify the tone, style, and format of responses

### 3. Progressive Disclosure
- Start with a simple interface, revealing complexity as needed
- Don't overwhelm users with options or capabilities
- Allow natural discovery of advanced features

### 4. Fail Gracefully
- Handle errors and edge cases gracefully
- Provide helpful error messages
- Offer alternative paths when the primary approach fails

### 5. Transparency
- Make it clear to users what the agent can and cannot do
- Explain reasoning for recommendations or actions
- Disclose when and how user data is being used

## Common Agent Patterns

### ReAct Pattern (Reasoning and Acting)
This pattern combines reasoning with action taking in an iterative process:
1. **Reason**: Think through the problem and plan
2. **Act**: Take an action using a tool
3. **Observe**: Process the results
4. Repeat as needed

```python
def react_agent(query, tools, client):
    messages = [
        {"role": "system", "content": "You are a helpful assistant that follows the ReAct pattern: Reason about the problem, Act by using a tool, and Observe the results, repeating as necessary."},
        {"role": "user", "content": query}
    ]

    max_turns = 10
    for _ in range(max_turns):
        response = client.chat.completions.create(
            model="gpt-4-turbo",
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )

        message = response.choices[0].message
        messages.append(message)

        # If the model chose to use a tool
        if message.tool_calls:
            for tool_call in message.tool_calls:
                # Execute the tool
                function_name = tool_call.function.name
                function_args = json.loads(tool_call.function.arguments)

                # Execute the function (implementation not shown)
                function_response = execute_function(function_name, function_args)

                # Add the observation to the messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": function_name,
                    "content": function_response
                })
        else:
            # If no tool was called, we have our final answer
            return message.content

    # If we hit the maximum turns, return the last message
    return messages[-1]["content"]
```

### Chain-of-Thought (CoT)
Encourages the agent to break down complex problems into steps:

```python
def chain_of_thought_agent(query, client):
    system_message = """
    You are a problem-solving assistant that uses a chain-of-thought approach.
    When given a complex problem:
    1. Break it down into smaller steps
    2. Think through each step logically
    3. Show your work and reasoning
    4. Arrive at a final answer
    """

    messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": query}
    ]

    response = client.chat.completions.create(
        model="gpt-4-turbo",
        messages=messages
    )

    return response.choices[0].message.content
```

### Tool-Augmented Agent
A general-purpose agent with access to various tools:

```python
def tool_augmented_agent(query, tools, client):
    system_message = """
    You are a helpful assistant with access to various tools.
    For complex tasks, use the appropriate tool to get information or perform actions.
    If you don't need any tools to answer a question, simply respond directly.
    """

    messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": query}
    ]

    # First decision: determine if tools are needed
    response = client.chat.completions.create(
        model="gpt-4-turbo",
        messages=messages,
        tools=tools,
        tool_choice="auto"
    )

    message = response.choices[0].message
    messages.append(message)

    # If tools are needed, process them
    if message.tool_calls:
        # Process tool calls as in the ReAct pattern
        # ...

        # After processing tools, get the final response
        final_response = client.chat.completions.create(
            model="gpt-4-turbo",
            messages=messages
        )

        return final_response.choices[0].message.content
    else:
        # Direct response without tools
        return message.content
```

### Multi-Agent Collaboration
Multiple specialized agents working together:

```python
class MultiAgentSystem:
    def __init__(self, client):
        self.client = client
        self.agents = {}
        self.coordinator = None

    def add_agent(self, name, system_message, tools=None):
        """Add a specialized agent to the system"""
        self.agents[name] = {
            "system_message": system_message,
            "tools": tools or []
        }

    def set_coordinator(self, system_message):
        """Set up the coordinator agent that delegates to specialists"""
        self.coordinator = system_message

    def run(self, query):
        """Run the multi-agent system on a query"""
        # First, have the coordinator analyze the task
        messages = [
            {"role": "system", "content": self.coordinator},
            {"role": "user", "content": query}
        ]

        response = self.client.chat.completions.create(
            model="gpt-4-turbo",
            messages=messages,
            response_format={"type": "json_object"}
        )

        # Parse the coordinator's decision
        coordinator_decision = json.loads(response.choices[0].message.content)
        selected_agent = coordinator_decision.get("selected_agent")

        if selected_agent not in self.agents:
            return f"Error: Selected agent '{selected_agent}' not found"

        # Run the selected specialized agent
        agent_config = self.agents[selected_agent]
        agent_messages = [
            {"role": "system", "content": agent_config["system_message"]},
            {"role": "user", "content": query}
        ]

        agent_response = self.client.chat.completions.create(
            model="gpt-4-turbo",
            messages=agent_messages,
            tools=agent_config["tools"]
        )

        return agent_response.choices[0].message.content
```

### Reflexion Pattern
Allows agents to reflect on and improve their responses:

```python
def reflexion_agent(query, client):
    system_message = """
    You are a thoughtful assistant that follows a two-step process:
    1. Generate an initial response to the user's query
    2. Reflect on and critique your initial response
    3. Provide an improved final response

    Your response should include:
    - Initial thoughts
    - Self-reflection and critique
    - Final improved response
    """

    messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": query}
    ]

    response = client.chat.completions.create(
        model="gpt-4-turbo",
        messages=messages
    )

    return response.choices[0].message.content
```

## System Message Templates

### General-Purpose Assistant
```
You are a helpful, harmless, and honest AI assistant.

For any user request:
1. If the request is unclear, ask clarifying questions
2. If the request is harmful or unethical, politely decline
3. Otherwise, provide a helpful and accurate response

Always prioritize user privacy and safety. If you need to use tools to answer a question, explain why you're using them.
```

### Domain Expert Agent
```
You are an AI assistant with expertise in {DOMAIN}.

When answering questions:
1. Draw upon your specialized knowledge of {DOMAIN}
2. Use technical terminology appropriate for the user's expertise level
3. Cite relevant sources or research when applicable
4. Clearly distinguish between factual information and opinions

Your main goal is to provide accurate, helpful information about {DOMAIN} in a clear and accessible way.
```

### Process Automation Agent
```
You are an AI process automation assistant designed to help with {PROCESS_TYPE}.

Your responsibilities include:
1. Guiding users through each step of the process
2. Using tools to perform necessary actions
3. Validating inputs before proceeding
4. Providing status updates throughout the process

Always confirm important actions before executing them. If errors occur, explain the issue and suggest solutions.
```

### Conversational Agent
```
You are a friendly, conversational AI assistant named {NAME}.

Your personality traits:
- Warm and approachable tone
- Occasionally uses light humor when appropriate
- Expresses empathy for user challenges
- Keeps responses concise and to the point

While being conversational, your primary goal is still to be helpful and accurate. Avoid unnecessary verbosity while maintaining a natural, engaging tone.
```

## Crafting Effective Tool Descriptions

### Good Tool Description Example
```python
{
    "type": "function",
    "function": {
        "name": "search_products",
        "description": "Search for products in the catalog based on various criteria. Use this when the user wants to find or browse products, compare options, or check product availability.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search term or keywords (e.g., 'red shoes', 'smartphone')"
                },
                "category": {
                    "type": "string",
                    "description": "Product category to filter by (e.g., 'electronics', 'clothing')"
                },
                "price_range": {
                    "type": "object",
                    "description": "Price range to filter by",
                    "properties": {
                        "min": {"type": "number", "description": "Minimum price"},
                        "max": {"type": "number", "description": "Maximum price"}
                    }
                },
                "sort_by": {
                    "type": "string",
                    "enum": ["relevance", "price_low_to_high", "price_high_to_low", "newest", "bestselling"],
                    "description": "How to sort the results"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of products to return (default: 10, max: 50)"
                }
            },
            "required": ["query"]
        }
    }
}
```

### vs. Poor Tool Description Example
```python
{
    "type": "function",
    "function": {
        "name": "search",
        "description": "Search for products",
        "parameters": {
            "type": "object",
            "properties": {
                "q": {"type": "string"},
                "cat": {"type": "string"},
                "price_min": {"type": "number"},
                "price_max": {"type": "number"},
                "sort": {"type": "string"},
                "limit": {"type": "integer"}
            },
            "required": ["q"]
        }
    }
}
```

## Error Handling Strategies

### Graceful Degradation
```python
def tool_with_graceful_degradation(function_name, args):
    try:
        # Attempt to call the primary implementation
        return primary_implementation(function_name, args)
    except ServiceUnavailableError:
        # Fall back to an alternative service
        return fallback_implementation(function_name, args)
    except RateLimitError:
        # Handle rate limiting with a helpful message
        return {
            "status": "error",
            "error_type": "rate_limited",
            "message": "Service temporarily unavailable due to high demand. Please try again in a few moments.",
            "partial_results": get_cached_results(function_name, args)
        }
    except Exception as e:
        # Generic error handler for unexpected errors
        log_error(e)  # Log for debugging
        return {
            "status": "error",
            "error_type": "unknown",
            "message": "An unexpected error occurred. Please try again or try a different approach."
        }
```

### Progressive Enhancement
```python
def search_with_progressive_enhancement(query, options=None):
    # Start with basic functionality that always works
    basic_results = basic_search(query)

    # Try to enhance with additional features if available
    try:
        if options and options.get("filter_by_date"):
            # Enhance with date filtering
            return date_filtered_search(query, options["date_range"])
        elif options and options.get("semantic_search"):
            # Enhance with semantic search
            return semantic_search(query)
        else:
            return basic_results
    except Exception:
        # If enhancement fails, return the basic results
        return basic_results
```

## Agent Evaluation Framework

### Key Metrics
- **Success Rate**: Percentage of tasks completed successfully
- **Number of Tool Calls**: Efficiency in using tools (fewer is often better)
- **Response Time**: Time taken to complete a task
- **User Satisfaction**: Subjective rating of the agent's performance
- **Error Rate**: Frequency of errors or hallucinations

### Evaluation Methods
1. **Automated Testing**:
   - Test suite with predefined queries and expected responses
   - Benchmark against previous versions

2. **Human Evaluation**:
   - Expert review of agent responses
   - A/B testing with users
   - Satisfaction surveys

3. **Comparative Evaluation**:
   - Compare performance against baseline agents
   - Compare specialized vs. general-purpose agents

### Sample Evaluation Script
```python
def evaluate_agent(agent_function, test_cases):
    results = {
        "total_cases": len(test_cases),
        "success_count": 0,
        "avg_tool_calls": 0,
        "avg_response_time": 0,
        "errors": []
    }

    total_tool_calls = 0
    total_time = 0

    for test_case in test_cases:
        query = test_case["query"]
        expected = test_case["expected"]

        try:
            start_time = time.time()
            response, tool_call_count = agent_function(query)
            end_time = time.time()

            # Calculate metrics
            duration = end_time - start_time
            total_time += duration
            total_tool_calls += tool_call_count

            # Check if response matches expectations
            if response_matches_expected(response, expected):
                results["success_count"] += 1
            else:
                results["errors"].append({
                    "query": query,
                    "expected": expected,
                    "actual": response,
                    "reason": "Response did not match expectations"
                })

        except Exception as e:
            results["errors"].append({
                "query": query,
                "error": str(e),
                "reason": "Exception occurred"
            })

    # Calculate averages
    results["success_rate"] = results["success_count"] / results["total_cases"]
    results["avg_tool_calls"] = total_tool_calls / results["total_cases"]
    results["avg_response_time"] = total_time / results["total_cases"]

    return results
```

## Security Best Practices

### Input Validation
- Validate all inputs from users before processing
- Use schemas to define expected input formats
- Reject or sanitize potentially harmful inputs

### Rate Limiting
- Implement rate limits on tool usage
- Monitor for suspicious patterns or abuse
- Apply progressive throttling for repeated violations

### Least Privilege
- Grant agents only the permissions they need
- Use scoped API keys with limited capabilities
- Regularly review and audit permissions

### Data Handling
- Minimize sensitive data exposure
- Encrypt sensitive information
- Implement proper data retention policies

### Monitoring and Logging
- Log all agent actions for audit purposes
- Monitor for unexpected behaviors or patterns
- Implement alerting for suspicious activities

## Resources
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [OpenAI Cookbook](https://cookbook.openai.com/)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)
