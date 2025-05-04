# OpenAI Agents: Memory and Context Management

## Understanding Agent Memory

Memory is crucial for agents to be effective over extended interactions. Without memory, agents would treat each interaction as isolated, losing valuable context and forcing users to repeatedly provide the same information.

## Types of Agent Memory

### Short-Term (Working) Memory
- Maintained within the conversation context
- Limited by the model's context window
- Automatically available to the model during a session
- Handled by maintaining the conversation history in the `messages` array

### Long-Term Memory
- Persists beyond the immediate conversation
- Stored externally (databases, vector stores, etc.)
- Needs to be explicitly retrieved and injected into the context
- Allows agents to remember past interactions across sessions

### Episodic Memory
- Records specific interactions and events
- Useful for referencing past experiences
- Can be organized chronologically

### Semantic Memory
- Stores conceptual knowledge and relationships
- Helps agents understand user preferences and requirements
- Often implemented using embeddings and vector search

## Implementing Memory Systems

### Conversation History
```python
class ConversationManager:
    def __init__(self, system_message="You are a helpful assistant."):
        self.messages = [{"role": "system", "content": system_message}]

    def add_user_message(self, content):
        self.messages.append({"role": "user", "content": content})

    def add_assistant_message(self, content):
        self.messages.append({"role": "assistant", "content": content})

    def add_tool_response(self, tool_call_id, name, content):
        self.messages.append({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "name": name,
            "content": content
        })

    def get_messages(self):
        return self.messages
```

### Vector Storage for Semantic Memory
```python
import numpy as np
from openai import OpenAI
from datetime import datetime

class VectorMemoryStore:
    def __init__(self):
        self.client = OpenAI()
        self.memories = []
        self.embeddings = []

    def add_memory(self, content, metadata=None):
        # Generate embedding for the content
        response = self.client.embeddings.create(
            input=content,
            model="text-embedding-3-small"
        )
        embedding = response.data[0].embedding

        # Store the memory with its embedding and metadata
        memory = {
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "metadata": metadata or {}
        }

        self.memories.append(memory)
        self.embeddings.append(embedding)

        return len(self.memories) - 1  # Return the index of the added memory

    def search_similar(self, query, top_k=3):
        # Generate embedding for the query
        response = self.client.embeddings.create(
            input=query,
            model="text-embedding-3-small"
        )
        query_embedding = response.data[0].embedding

        # Calculate similarity scores
        similarities = []
        for emb in self.embeddings:
            similarity = np.dot(query_embedding, emb)
            similarities.append(similarity)

        # Get indices of top K similar memories
        top_indices = sorted(range(len(similarities)),
                            key=lambda i: similarities[i],
                            reverse=True)[:top_k]

        # Return the most similar memories
        return [self.memories[i] for i in top_indices]
```

### Structured Knowledge Base
```python
class KnowledgeBase:
    def __init__(self):
        self.facts = {}
        self.preferences = {}
        self.history = []

    def add_fact(self, category, key, value):
        if category not in self.facts:
            self.facts[category] = {}
        self.facts[category][key] = value

    def get_fact(self, category, key):
        return self.facts.get(category, {}).get(key)

    def add_preference(self, category, key, value):
        if category not in self.preferences:
            self.preferences[category] = {}
        self.preferences[category][key] = value

    def get_preference(self, category, key):
        return self.preferences.get(category, {}).get(key)

    def add_historical_event(self, event_type, details, timestamp=None):
        event = {
            "type": event_type,
            "details": details,
            "timestamp": timestamp or datetime.now().isoformat()
        }
        self.history.append(event)

    def get_recent_history(self, event_type=None, limit=5):
        filtered = [e for e in self.history if event_type is None or e["type"] == event_type]
        return sorted(filtered, key=lambda x: x["timestamp"], reverse=True)[:limit]

    def summarize_for_context(self):
        """Generate a summary of relevant knowledge to inject into context"""
        summary = []

        if self.facts:
            facts_summary = "Known facts:\n"
            for category, items in self.facts.items():
                facts_summary += f"- {category.capitalize()}: "
                facts_summary += ", ".join([f"{k}={v}" for k, v in items.items()])
                facts_summary += "\n"
            summary.append(facts_summary)

        if self.preferences:
            prefs_summary = "User preferences:\n"
            for category, items in self.preferences.items():
                prefs_summary += f"- {category.capitalize()}: "
                prefs_summary += ", ".join([f"{k}={v}" for k, v in items.items()])
                prefs_summary += "\n"
            summary.append(prefs_summary)

        recent_history = self.get_recent_history(limit=3)
        if recent_history:
            history_summary = "Recent interactions:\n"
            for event in recent_history:
                history_summary += f"- {event['timestamp']}: {event['type']} - {event['details']}\n"
            summary.append(history_summary)

        return "\n".join(summary)
```

## Context Window Management

### Truncation Strategies
- **Simple Truncation**: Remove oldest messages when context limit is reached
- **Summarization**: Replace older messages with a summary
- **Selective Retention**: Keep important messages, discard less relevant ones
- **Importance Weighting**: Assign importance scores to messages and retain the most important ones

### Messages Compression Example
```python
from openai import OpenAI

class ConversationCompressor:
    def __init__(self, max_tokens=4000):
        self.client = OpenAI()
        self.max_tokens = max_tokens

    def compress_messages(self, messages):
        """Compress conversation history when it gets too long"""
        # If messages are short enough, return as is
        if self._estimate_tokens(messages) <= self.max_tokens:
            return messages

        # Keep system message and most recent user and assistant messages
        system_message = next((m for m in messages if m["role"] == "system"), None)
        recent_messages = messages[-4:]  # Keep last 2 exchanges (4 messages)

        # Summarize the middle portion
        middle_messages = messages[1:-4] if system_message else messages[:-4]
        if not middle_messages:
            return messages

        # Generate a summary of the conversation so far
        middle_content = "\n".join([f"{m['role']}: {m['content']}" for m in middle_messages])
        summary_prompt = f"Summarize the following conversation concisely while preserving key information:\n\n{middle_content}"

        summary_response = self.client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": summary_prompt}]
        )
        summary = summary_response.choices[0].message.content

        # Create a new set of messages with the summary
        compressed_messages = []
        if system_message:
            compressed_messages.append(system_message)

        compressed_messages.append({
            "role": "assistant",
            "content": f"[Conversation history summary: {summary}]"
        })

        # Add the most recent messages
        compressed_messages.extend(recent_messages)

        return compressed_messages

    def _estimate_tokens(self, messages):
        """Rough estimate of token count in messages"""
        # This is a simple approximation; actual token count depends on the tokenizer
        total_chars = sum(len(m.get("content", "")) for m in messages)
        # Roughly 4 characters per token for English text
        return total_chars // 4
```

## Advanced Memory Techniques

### Memory Extraction
```python
def extract_important_information(messages):
    """Extract important information from the conversation"""
    extraction_prompt = """
    From the conversation below, extract:
    1. User preferences
    2. Important facts or information
    3. Tasks or commitments made

    Format the output as JSON with these categories.

    Conversation:
    """

    # Combine messages into a single text for analysis
    conversation_text = "\n".join([
        f"{m['role'].upper()}: {m['content']}"
        for m in messages
        if m['role'] in ['user', 'assistant']
    ])

    # Use OpenAI to extract the structured information
    client = OpenAI()
    response = client.chat.completions.create(
        model="gpt-4-turbo",
        messages=[
            {"role": "system", "content": "You are an information extraction assistant."},
            {"role": "user", "content": extraction_prompt + conversation_text}
        ],
        response_format={"type": "json_object"}
    )

    return json.loads(response.choices[0].message.content)
```

### Memory Consolidation
- Periodically review and consolidate memories
- Group related information together
- Remove redundancies
- Update outdated information

### Memory Pruning
- Remove irrelevant or outdated memories
- Maintain a recency bias for certain types of information
- Use usage statistics to identify important vs. rarely used memories

## Incorporating Memory into Agent Responses

### Memory Retrieval Based on User Queries
```python
def enhance_prompt_with_memories(user_query, memory_store):
    """Retrieve relevant memories and enhance the user query"""
    relevant_memories = memory_store.search_similar(user_query)

    if not relevant_memories:
        return user_query

    # Construct an enhanced prompt with relevant memories
    memory_context = "Relevant information from our previous conversations:\n"
    for i, memory in enumerate(relevant_memories, 1):
        memory_context += f"{i}. {memory['content']}\n"

    enhanced_prompt = f"{memory_context}\n\nWith this in mind, please respond to: {user_query}"
    return enhanced_prompt
```

### System Message Augmentation
```python
def create_system_message_with_memory(knowledge_base):
    """Create a system message enriched with relevant memory"""
    base_instructions = "You are a helpful assistant that remembers previous interactions."

    # Get knowledge summary
    memory_context = knowledge_base.summarize_for_context()

    system_message = f"{base_instructions}\n\n{memory_context}"
    return {"role": "system", "content": system_message}
```

## Ethical Considerations

### Transparency
- Be clear about what information is being stored
- Explain how stored information will be used
- Allow users to review stored information

### Data Minimization
- Only store information that's necessary
- Implement automatic expiry for outdated information
- Process information at the lowest required detail level

### User Control
- Allow users to delete specific memories
- Provide options to reset the agent's memory
- Enable granular privacy settings

## Resources
- [OpenAI Documentation on Token Limits](https://platform.openai.com/docs/guides/chat)
- [Embeddings Documentation](https://platform.openai.com/docs/guides/embeddings)
- [Vector Database Options](https://github.com/openai/openai-cookbook/blob/main/examples/vector_databases/)
