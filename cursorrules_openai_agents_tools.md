# OpenAI Agents: Tools and Function Calling

## Understanding Agent Tools

Tools are the key components that give agents the ability to interact with the world. An agent without tools would be limited to generating text responses based on its training data. With tools, agents can:

- Fetch real-time information (weather, stock prices, news)
- Interact with external APIs and services
- Perform computations and data analysis
- Create, read, update, and delete data
- Execute actions on behalf of users

## Tool Definition Structure

Tools in the OpenAI API are defined using a JSON schema:

```python
{
    "type": "function",
    "function": {
        "name": "tool_name",
        "description": "A description of what the tool does and when to use it",
        "parameters": {
            "type": "object",
            "properties": {
                "param1": {
                    "type": "string",
                    "description": "Description of this parameter"
                },
                "param2": {
                    "type": "number",
                    "description": "Description of this parameter"
                }
            },
            "required": ["param1"]
        }
    }
}
```

The `parameters` field uses JSON Schema to define the expected inputs for the tool, including:
- Types (string, number, boolean, object, array)
- Descriptions for each parameter
- Required parameters
- Enumerated options
- Default values

## Parallel Function Calling

Agents can call multiple functions in parallel, which is useful for:
- Making simultaneous API calls
- Performing batch operations
- Improving efficiency for independent tasks

### Example of Parallel Function Calling

```python
import openai
import json
import asyncio
from typing import List, Dict, Any

async def execute_function(function_name: str, arguments: Dict[str, Any]):
    # This would be your actual function implementation
    if function_name == "get_weather":
        location = arguments.get("location")
        return f"Weather in {location} is sunny, 72°F"
    elif function_name == "get_news":
        topic = arguments.get("topic")
        return f"Latest news about {topic}: New developments announced today."

async def run_agent_with_parallel_tools(user_query: str, tools: List[Dict[str, Any]]):
    messages = [
        {"role": "system", "content": "You are a helpful assistant that can use multiple tools in parallel when appropriate."},
        {"role": "user", "content": user_query}
    ]

    response = openai.chat.completions.create(
        model="gpt-4-turbo",
        messages=messages,
        tools=tools,
        tool_choice="auto"
    )

    message = response.choices[0].message
    messages.append(message)

    if message.tool_calls:
        # Create tasks for all tool calls
        tasks = []
        for tool_call in message.tool_calls:
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)
            tasks.append(execute_function(function_name, function_args))

        # Execute all tool calls in parallel
        results = await asyncio.gather(*tasks)

        # Add tool responses to messages
        for i, result in enumerate(results):
            tool_call = message.tool_calls[i]
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "name": tool_call.function.name,
                "content": result
            })

        # Get final response
        final_response = openai.chat.completions.create(
            model="gpt-4-turbo",
            messages=messages
        )

        return final_response.choices[0].message.content

    return message.content
```

## Tool Categories and Examples

### Data Retrieval Tools
- **Database Query Tool**: Fetch information from databases
- **Web Search Tool**: Find information from the internet
- **Document Retrieval Tool**: Get content from specific documents

### External API Tools
- **Weather API Tool**: Get current weather conditions
- **Calendar API Tool**: View and manage calendar events
- **Email API Tool**: Send or read emails

### Computation Tools
- **Calculator Tool**: Perform mathematical calculations
- **Data Analysis Tool**: Analyze datasets and generate insights
- **Code Execution Tool**: Run code snippets in a sandbox environment

### Creation Tools
- **Document Generation Tool**: Create new documents or reports
- **Image Generation Tool**: Generate images from descriptions
- **Code Generation Tool**: Create code based on requirements

## Best Practices for Tool Design

### Clarity and Specificity
- Give tools clear, descriptive names
- Provide detailed descriptions of what the tool does
- Be explicit about when to use (and not use) the tool

### Parameter Design
- Use descriptive parameter names
- Include detailed descriptions for each parameter
- Specify required vs. optional parameters
- Use appropriate JSON schema types and validations

### Error Handling
```python
def call_function(function_name, arguments):
    try:
        # Attempt to call the function with the provided arguments
        if function_name == "get_weather":
            return get_weather(arguments.get("location"))
        # More function handlers...
    except Exception as e:
        # Return a structured error response
        return {
            "status": "error",
            "message": str(e),
            "error_type": type(e).__name__
        }
```

### Tool Response Format
- Use consistent response structures
- Include status indicators (success/failure)
- Provide detailed error messages when things go wrong
- Format data in a way that's easy for the agent to understand

## Security Considerations

### Input Validation
- Validate all inputs before processing
- Check types, ranges, and formats
- Sanitize inputs to prevent injection attacks

### Access Control
- Implement authentication for sensitive tools
- Use principle of least privilege
- Consider role-based access control

### Rate Limiting
- Implement rate limits to prevent abuse
- Consider throttling for expensive operations
- Add timeouts for external API calls

### Logging and Monitoring
- Log all tool invocations
- Monitor for unusual patterns or potential abuse
- Implement alerting for suspicious activities

## Testing Tools

### Unit Testing
- Test each tool function independently
- Check handling of valid and invalid inputs
- Verify error handling behavior

### Integration Testing
- Test tools with actual agent interactions
- Verify end-to-end functionality
- Check response handling in the agent

### Edge Cases
- Test with empty inputs
- Test with maximum-length inputs
- Test with unexpected or malformed inputs

## Advanced Tool Techniques

### Tool Versions
- Include version information in tool definitions
- Support multiple versions for backward compatibility
- Deprecate and sunset old versions gracefully

### Tool Dependencies
- Define prerequisites for tool usage
- Handle sequential tool dependencies
- Document dependencies between tools

### Dynamic Tool Registration
```python
class ToolRegistry:
    def __init__(self):
        self.tools = {}

    def register_tool(self, tool_definition):
        name = tool_definition["function"]["name"]
        self.tools[name] = tool_definition

    def get_available_tools(self, user_id=None, permissions=None):
        # Return tools filtered by user permissions
        return list(self.tools.values())
```

## Resources

- [OpenAI Function Calling API Reference](https://platform.openai.com/docs/api-reference/chat/create#chat/create-tools)
- [JSON Schema Specification](https://json-schema.org/specification)
- [OpenAI Cookbook: Function Calling Examples](https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models)
