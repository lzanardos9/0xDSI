# LLM Integration Guide for Natural Language Search
## Transform Keyword Search into Intelligent Prompt-Based Search

---

## Why You Need LLM Integration

### Current State (Mock Embeddings)
```typescript
// Your current code generates random vectors
static generateMockEmbedding(dimension: number = 1536): number[] {
  const embedding = new Array(dimension);
  for (let i = 0; i < dimension; i++) {
    embedding[i] = Math.random() * 2 - 1;  // ❌ Random, meaningless
  }
  return embedding;
}
```

**Problem**: Random embeddings don't capture semantic meaning, so searches like:
- ❌ "Show me all lateral movement attempts in the last hour"
- ❌ "Find suspicious login activity from executive accounts"
- ❌ "What ransomware indicators do we have?"

...will not work properly because the vectors don't represent actual semantic similarity.

### With Real LLM (OpenAI, Databricks, etc.)
```typescript
// Real embeddings capture semantic meaning
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: "Show me all lateral movement attempts"
});
// ✅ Returns 1536-dimensional vector representing the MEANING
```

**Result**: Natural language queries work because semantically similar text has similar vectors.

---

## Architecture Options

### Option 1: OpenAI API (Easiest) ⭐ RECOMMENDED
**Pros**:
- ✅ Best quality embeddings
- ✅ Simple API
- ✅ 5-minute setup

**Cons**:
- ⚠️ Costs ~$0.0001 per 1K tokens (~$0.10 per million)
- ⚠️ Data leaves your infrastructure

**Models**:
- `text-embedding-3-small` - 1536 dimensions, $0.00002/1K tokens
- `text-embedding-3-large` - 3072 dimensions, $0.00013/1K tokens

### Option 2: Databricks Foundation Models (For Databricks Apps) ⭐ BEST FOR YOUR MIGRATION
**Pros**:
- ✅ Integrated with Databricks platform
- ✅ Data stays in your infrastructure
- ✅ Already paid for with Databricks license
- ✅ Supports multiple models

**Cons**:
- ⚠️ Requires Databricks workspace

**Models**:
- `bge-large-en` - 1024 dimensions
- `gte-large-en` - 1024 dimensions
- `e5-large-v2` - 1024 dimensions

### Option 3: Self-Hosted (Supabase + pgvector + SentenceTransformers)
**Pros**:
- ✅ Free (no API costs)
- ✅ Full control
- ✅ Data never leaves your infrastructure

**Cons**:
- ⚠️ Need GPU for good performance
- ⚠️ More complex setup

**Models**:
- `all-MiniLM-L6-v2` - 384 dimensions, fast
- `all-mpnet-base-v2` - 768 dimensions, balanced
- `gte-large` - 1024 dimensions, best quality

### Option 4: Hybrid (Supabase + Edge Function + External LLM)
**Pros**:
- ✅ Best of both worlds
- ✅ Caching reduces costs
- ✅ Fallback options

**Cons**:
- ⚠️ More complex architecture

---

## Implementation Guide

### Option 1: OpenAI API Integration (Quick Start)

#### Step 1: Install Dependencies
```bash
npm install openai
```

#### Step 2: Add Environment Variables
```bash
# .env
VITE_OPENAI_API_KEY=sk-...your-key-here
```

#### Step 3: Update vectorEngine.ts
```typescript
// src/lib/vectorEngine.ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Only for demo - use edge function in prod
});

export class VectorEmbeddingEngine {
  // Replace mock with real OpenAI embeddings
  static async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        encoding_format: "float"
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      // Fallback to mock if API fails
      return this.generateMockEmbedding();
    }
  }

  // Semantic search now works with real meaning!
  static async semanticSearch(
    query: string,
    supabase: any,
    threshold: number = 0.8,
    limit: number = 10
  ): Promise<SemanticSearchResult[]> {
    // Convert natural language to vector
    const queryEmbedding = await this.generateEmbedding(query);

    // Search by semantic similarity
    const { data, error } = await supabase.rpc('search_similar_events', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('Semantic search error:', error);
      return [];
    }

    return data || [];
  }

  // NEW: Natural language query to SQL
  static async naturalLanguageToQuery(
    prompt: string,
    supabase: any
  ): Promise<{sql: string, explanation: string}> {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a SQL expert for a SIEM database. Convert natural language to PostgreSQL queries.

Available tables:
- events (event_type, severity, source_ip, dest_ip, username, event_timestamp)
- alerts (severity, status, alert_type, created_at)
- graph_nodes (node_type, node_id, properties)
- graph_edges (src, dst, relationship, weight)
- threat_feeds (indicator, threat_type, severity, confidence)

Return JSON: {"sql": "SELECT ...", "explanation": "This query..."}
`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content);
      return result;
    } catch (error) {
      console.error('Error converting query:', error);
      throw error;
    }
  }

  // NEW: Explain search results in plain English
  static async explainResults(
    query: string,
    results: any[]
  ): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a security analyst. Explain search results in plain English."
          },
          {
            role: "user",
            content: `Query: "${query}"\n\nResults:\n${JSON.stringify(results, null, 2)}\n\nExplain what was found:`
          }
        ]
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('Error explaining results:', error);
      return "Results found. Could not generate explanation.";
    }
  }
}
```

#### Step 4: Update Search Component
```typescript
// src/components/LuceneFastSearch.tsx
import { VectorEmbeddingEngine } from '../lib/vectorEngine';

export function LuceneFastSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNaturalLanguageSearch = async () => {
    setLoading(true);

    try {
      // Option A: Semantic vector search
      const vectorResults = await VectorEmbeddingEngine.semanticSearch(
        query,
        supabase,
        0.75, // Lower threshold = more results
        20
      );

      setResults(vectorResults);

      // Get AI explanation
      const explain = await VectorEmbeddingEngine.explainResults(
        query,
        vectorResults
      );
      setExplanation(explain);

    } catch (error) {
      console.error('Search failed:', error);
    }

    setLoading(false);
  };

  const handleTextToSQL = async () => {
    setLoading(true);

    try {
      // Option B: Convert to SQL query
      const { sql, explanation } = await VectorEmbeddingEngine.naturalLanguageToQuery(
        query,
        supabase
      );

      setExplanation(explanation);

      // Execute the generated SQL
      const { data, error } = await supabase.rpc('execute_raw_sql', {
        query_text: sql
      });

      if (!error) {
        setResults(data);
      }

    } catch (error) {
      console.error('Query generation failed:', error);
    }

    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything: 'Show me brute force attempts from China last week'"
          className="flex-1 bg-slate-800 text-white px-4 py-2 rounded"
        />
        <button
          onClick={handleNaturalLanguageSearch}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded"
        >
          {loading ? 'Searching...' : 'Semantic Search'}
        </button>
        <button
          onClick={handleTextToSQL}
          disabled={loading}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded"
        >
          Text to SQL
        </button>
      </div>

      {explanation && (
        <div className="bg-slate-800 p-4 rounded">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">AI Explanation:</h3>
          <p className="text-slate-400 text-sm">{explanation}</p>
        </div>
      )}

      <div className="space-y-2">
        {results.map((result, i) => (
          <div key={i} className="bg-slate-800 p-4 rounded">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-white">{result.event_summary || result.description}</p>
                <p className="text-slate-400 text-sm">{result.event_timestamp}</p>
              </div>
              {result.similarity && (
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                  {(result.similarity * 100).toFixed(1)}% match
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### Option 2: Databricks Foundation Models (Best for Your Migration)

Since you're migrating to Databricks, this is the ideal approach:

#### Step 1: Create Embedding Edge Function
```typescript
// supabase/functions/generate-embeddings/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DATABRICKS_HOST = Deno.env.get('DATABRICKS_HOST');
const DATABRICKS_TOKEN = Deno.env.get('DATABRICKS_TOKEN');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { texts } = await req.json();

    // Call Databricks Foundation Model API
    const response = await fetch(
      `https://${DATABRICKS_HOST}/serving-endpoints/databricks-bge-large-en/invocations`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: texts,
          task: "llm/v1/embeddings"
        })
      }
    );

    const embeddings = await response.json();

    return new Response(
      JSON.stringify({ embeddings: embeddings.data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

#### Step 2: Update Frontend to Use Edge Function
```typescript
// src/lib/vectorEngine.ts
export class VectorEmbeddingEngine {
  static async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-embeddings`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ texts: [text] })
        }
      );

      const { embeddings } = await response.json();
      return embeddings[0];

    } catch (error) {
      console.error('Error generating embedding:', error);
      return this.generateMockEmbedding(); // Fallback
    }
  }
}
```

---

### Option 3: Self-Hosted with Supabase Edge Function

#### Step 1: Create Python Edge Function (using Deno FFI)
```typescript
// supabase/functions/local-embeddings/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Use a lightweight JS embedding library
import { pipeline } from 'npm:@xenova/transformers@2.14.0';

let embedder = null;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Lazy load model
    if (!embedder) {
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }

    const { text } = await req.json();

    // Generate embedding
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);

    return new Response(
      JSON.stringify({ embedding }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## Example Use Cases

### 1. Natural Language Threat Hunting
```typescript
// User types: "Find all privilege escalation attempts from Linux servers"
const results = await VectorEmbeddingEngine.semanticSearch(
  "privilege escalation attempts from Linux servers",
  supabase,
  0.75,
  50
);

// Returns events semantically similar to the query
// Even if exact keywords don't match!
```

### 2. Text-to-SQL Query Generation
```typescript
// User types: "Show me top 10 most targeted assets this week"
const { sql, explanation } = await VectorEmbeddingEngine.naturalLanguageToQuery(
  "Show me top 10 most targeted assets this week",
  supabase
);

// Generated SQL:
// SELECT asset_name, COUNT(*) as hit_count
// FROM events
// WHERE event_timestamp >= NOW() - INTERVAL '7 days'
// GROUP BY asset_name
// ORDER BY hit_count DESC
// LIMIT 10
```

### 3. Intelligent Alert Correlation
```typescript
// Find similar alerts automatically
const similarAlerts = await VectorEmbeddingEngine.findSimilarEvents(
  currentAlertId,
  supabase,
  0.90 // High threshold = very similar
);

// Groups related alerts into campaigns
```

### 4. Conversational SIEM Query
```typescript
// Multi-turn conversation
const chatHistory = [
  { role: "user", content: "Show me ransomware activity" },
  { role: "assistant", content: "Found 5 ransomware indicators..." },
  { role: "user", content: "Which assets were affected?" },
  // LLM understands context and generates appropriate query
];
```

---

## Cost Comparison

### OpenAI Pricing (text-embedding-3-small)
- **Cost**: $0.00002 per 1K tokens
- **Example**:
  - 10,000 events/day × 100 tokens avg = 1M tokens/day
  - Cost: $0.02/day = **$7.30/month**

### Databricks Foundation Models
- **Cost**: Included in Databricks license
- **No additional fees** for embeddings
- **Best choice** if using Databricks Apps

### Self-Hosted
- **Cost**: Infrastructure only (GPU recommended)
- **Typical**: $100-300/month for GPU instance
- **Free tier**: CPU-only (slower but works)

---

## Migration Path

### Phase 1: Quick Win with OpenAI (1 day)
1. Add OpenAI API key
2. Update `generateEmbedding()` function
3. Test semantic search
4. Deploy

### Phase 2: Edge Function (1 week)
1. Create Supabase Edge Function
2. Move LLM calls to backend
3. Add caching layer
4. Secure API keys

### Phase 3: Databricks Integration (with your migration)
1. Deploy to Databricks Apps
2. Use Databricks Foundation Models
3. Leverage Mosaic AI Vector Search
4. Full platform integration

---

## Security Best Practices

### ❌ DON'T: Expose API Keys in Frontend
```typescript
// BAD - API key visible in browser
const openai = new OpenAI({
  apiKey: "sk-...actual-key...",
  dangerouslyAllowBrowser: true
});
```

### ✅ DO: Use Edge Functions
```typescript
// GOOD - API key stays on server
const response = await fetch('/functions/v1/generate-embeddings', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${anonKey}` },
  body: JSON.stringify({ text })
});
```

### ✅ DO: Implement Rate Limiting
```sql
-- Add rate limiting table
CREATE TABLE api_rate_limits (
  user_id uuid,
  endpoint text,
  request_count integer,
  window_start timestamptz,
  PRIMARY KEY (user_id, endpoint, window_start)
);
```

### ✅ DO: Cache Embeddings
```sql
-- Cache embeddings to avoid regeneration
CREATE TABLE embedding_cache (
  text_hash text PRIMARY KEY,
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_embedding_cache_created
  ON embedding_cache(created_at);
```

---

## Testing Your Integration

### Test 1: Semantic Similarity
```typescript
// These should return similar results:
await semanticSearch("brute force attack", supabase);
await semanticSearch("password guessing attempt", supabase);
await semanticSearch("multiple failed login attempts", supabase);
```

### Test 2: Cross-Language Understanding
```typescript
// Should understand intent, not just keywords
await semanticSearch("lateral movement", supabase);
await semanticSearch("attacker moving between systems", supabase);
await semanticSearch("privilege escalation on multiple hosts", supabase);
```

### Test 3: Context Understanding
```typescript
// Should differentiate context
await semanticSearch("ransomware encryption", supabase); // Malicious
await semanticSearch("backup encryption", supabase);     // Benign
```

---

## Recommended Approach for Your Platform

Based on your Databricks migration:

### **Phase 1: Immediate (OpenAI)**
- Quick implementation for demo/testing
- Cost: ~$10/month
- Time: 1 day

### **Phase 2: Production (Databricks Foundation Models)**
- Integrate with Databricks Apps migration
- Cost: Included
- Time: Part of migration (already planned)

### **Phase 3: Advanced (Mosaic AI)**
- Use Databricks Mosaic AI for advanced features
- RAG (Retrieval Augmented Generation)
- Multi-modal search (text, code, logs)
- Cost: Included in Databricks

---

## Next Steps

1. **Quick Test**: Add OpenAI API key and test semantic search (15 min)
2. **Evaluate**: Compare results vs keyword search
3. **Decide**: Choose final architecture (OpenAI, Databricks, or self-hosted)
4. **Implement**: Follow guide for chosen option
5. **Deploy**: Integrate with your Databricks migration

---

## Conclusion

**Yes, you need LLM integration** for true natural language prompt-based search. The current mock embeddings won't capture semantic meaning.

**Recommended path**:
1. Start with OpenAI for quick testing
2. Migrate to Databricks Foundation Models when deploying Databricks Apps
3. Leverage your existing vector infrastructure (it's already well-designed!)

Your platform already has the vector search infrastructure in place - you just need to replace the mock embeddings with real ones. The rest will work as designed!
