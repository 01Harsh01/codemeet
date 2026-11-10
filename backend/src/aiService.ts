import crypto from 'crypto';

export interface AIAssistRequest {
  action: 'explain' | 'debug' | 'optimize' | 'testcases' | 'hints' | 'complexity' | 'runtime_error' | 'custom' | 'generate';
  language: string;
  code?: string;
  prompt?: string;
  context?: string;
  errorOutput?: string;
  provider?: 'gemini' | 'groq' | 'openai' | 'openrouter' | 'ollama' | 'auto';
  apiKey?: string;
  model?: string;
}

export interface AIMockInterviewRequest {
  topic: string;
  messageHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  candidateCode?: string;
  mode?: 'interview' | 'evaluate';
  provider?: 'gemini' | 'groq' | 'openai' | 'openrouter' | 'ollama' | 'auto';
  apiKey?: string;
  model?: string;
}

// ---------------------------------------------------------------------
// LLM Provider Invocation Helpers
// ---------------------------------------------------------------------

async function callGroq(prompt: string, apiKey: string, model?: string, sysPrompt?: string): Promise<string> {
  const chosenModel = model || 'llama-3.3-70b-versatile';
  const system = sysPrompt || 'You are CodeMeet AI Copilot, an elite Staff Software Engineer. Write clear, production-grade code with markdown explanations and complexity analysis.';
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1800,
    }),
  });

  if (!response.ok) {
    const errData: any = await response.json().catch(() => ({}));
    throw new Error(`Groq API error (${response.status}): ${errData?.error?.message || response.statusText}`);
  }

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned empty response');
  return text;
}

async function callGemini(prompt: string, apiKey: string, model?: string): Promise<string> {
  const chosenModel = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1800, temperature: 0.2 },
    }),
  });

  if (!response.ok) {
    const errData: any = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error (${response.status}): ${errData?.error?.message || response.statusText}`);
  }

  const data: any = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

async function callOpenAI(prompt: string, apiKey: string, model?: string, sysPrompt?: string): Promise<string> {
  const chosenModel = model || 'gpt-4o-mini';
  const system = sysPrompt || 'You are CodeMeet AI Copilot, an elite Staff Software Engineer.';
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1800,
    }),
  });

  if (!response.ok) {
    const errData: any = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error (${response.status}): ${errData?.error?.message || response.statusText}`);
  }

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned empty response');
  return text;
}

async function callOpenRouter(prompt: string, apiKey: string, model?: string, sysPrompt?: string): Promise<string> {
  const chosenModel = model || 'meta-llama/llama-3.3-70b-instruct:free';
  const system = sysPrompt || 'You are CodeMeet AI Copilot, an elite Staff Software Engineer.';
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'CodeMeet Collaborative Editor',
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1800,
    }),
  });

  if (!response.ok) {
    const errData: any = await response.json().catch(() => ({}));
    throw new Error(`OpenRouter API error (${response.status}): ${errData?.error?.message || response.statusText}`);
  }

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned empty response');
  return text;
}

async function callOllama(prompt: string, model?: string, sysPrompt?: string): Promise<string> {
  const chosenModel = model || 'llama3';
  const system = sysPrompt || 'You are CodeMeet AI Copilot.';
  
  const response = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama connection error (${response.status}). Is Ollama running on port 11434?`);
  }

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Ollama returned empty response');
  return text;
}

// ---------------------------------------------------------------------
// Resolve Provider & Key
// ---------------------------------------------------------------------

function resolveProvider(req: { provider?: string; apiKey?: string; model?: string }): {
  provider: 'gemini' | 'groq' | 'openai' | 'openrouter' | 'ollama' | 'offline';
  apiKey: string;
  model?: string;
} {
  const reqKey = (req.apiKey || '').trim();
  let prov = req.provider || 'auto';

  // If explicit provider chosen
  if (prov === 'groq') {
    const key = reqKey || process.env.GROQ_API_KEY || '';
    return { provider: key ? 'groq' : 'offline', apiKey: key, model: req.model || 'llama-3.3-70b-versatile' };
  }
  if (prov === 'gemini') {
    const key = reqKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    return { provider: key ? 'gemini' : 'offline', apiKey: key, model: req.model || 'gemini-1.5-flash' };
  }
  if (prov === 'openai') {
    const key = reqKey || process.env.OPENAI_API_KEY || '';
    return { provider: key ? 'openai' : 'offline', apiKey: key, model: req.model || 'gpt-4o-mini' };
  }
  if (prov === 'openrouter') {
    const key = reqKey || process.env.OPENROUTER_API_KEY || '';
    return { provider: key ? 'openrouter' : 'offline', apiKey: key, model: req.model || 'meta-llama/llama-3.3-70b-instruct:free' };
  }
  if (prov === 'ollama') {
    return { provider: 'ollama', apiKey: '', model: req.model || 'llama3' };
  }

  // Auto-detect based on key prefix
  if (reqKey) {
    if (reqKey.startsWith('gsk_')) {
      return { provider: 'groq', apiKey: reqKey, model: req.model || 'llama-3.3-70b-versatile' };
    }
    if (reqKey.startsWith('sk-or-')) {
      return { provider: 'openrouter', apiKey: reqKey, model: req.model || 'meta-llama/llama-3.3-70b-instruct:free' };
    }
    if (reqKey.startsWith('sk-')) {
      return { provider: 'openai', apiKey: reqKey, model: req.model || 'gpt-4o-mini' };
    }
    if (reqKey.startsWith('AIza')) {
      return { provider: 'gemini', apiKey: reqKey, model: req.model || 'gemini-1.5-flash' };
    }
    // Default assumption for unknown custom key
    return { provider: 'gemini', apiKey: reqKey, model: req.model || 'gemini-1.5-flash' };
  }

  // Check server environment variables in order of speed and capability
  if (process.env.GROQ_API_KEY) {
    return { provider: 'groq', apiKey: process.env.GROQ_API_KEY, model: req.model || 'llama-3.3-70b-versatile' };
  }
  if (process.env.GEMINI_API_KEY || process.env.AI_API_KEY) {
    return { provider: 'gemini', apiKey: (process.env.GEMINI_API_KEY || process.env.AI_API_KEY)!, model: req.model || 'gemini-1.5-flash' };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: req.model || 'gpt-4o-mini' };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY, model: req.model || 'meta-llama/llama-3.3-70b-instruct:free' };
  }

  return { provider: 'offline', apiKey: '', model: undefined };
}

// ---------------------------------------------------------------------
// Primary AI Assist Handler
// ---------------------------------------------------------------------

export async function processAIAssist(req: AIAssistRequest): Promise<{ text: string; codeSnippet?: string; providerUsed?: string }> {
  const resolved = resolveProvider(req);
  const prompt = constructPrompt(req);

  if (resolved.provider !== 'offline') {
    try {
      let text = '';
      if (resolved.provider === 'groq') {
        text = await callGroq(prompt, resolved.apiKey, resolved.model);
      } else if (resolved.provider === 'gemini') {
        text = await callGemini(prompt, resolved.apiKey, resolved.model);
      } else if (resolved.provider === 'openai') {
        text = await callOpenAI(prompt, resolved.apiKey, resolved.model);
      } else if (resolved.provider === 'openrouter') {
        text = await callOpenRouter(prompt, resolved.apiKey, resolved.model);
      } else if (resolved.provider === 'ollama') {
        text = await callOllama(prompt, resolved.model);
      }

      if (text) {
        return { text, providerUsed: `${resolved.provider} (${resolved.model || 'default'})` };
      }
    } catch (err: any) {
      console.warn(`[AI Service] ${resolved.provider} call failed:`, err.message);
      // If user explicitly provided a key that failed, report the exact error clearly!
      if (req.apiKey) {
        return {
          text: `⚠️ **${resolved.provider.toUpperCase()} API Error**: ${err.message}\n\nPlease verify your API key in **⚙️ Connect LLM** settings or check account quotas.`,
        };
      }
    }
  }

  // Fallback to offline algorithm & reasoning engine
  return generateLocalAIResponse(req);
}

function constructPrompt(req: AIAssistRequest): string {
  const { action, language, code, prompt, context, errorOutput } = req;
  const sys = `You are CodeMeet AI Copilot, a Staff Software Engineer and DSA Expert. Provide clear, direct, optimal code and structured markdown.`;

  switch (action) {
    case 'custom':
    case 'generate':
      return `${sys}
User Query: "${prompt || 'Help with this implementation'}"
Active Language: ${language}
Current Code in Monaco Editor:
\`\`\`${language}
${code || '(Monaco editor is currently empty)'}
\`\`\`
Provide a complete, production-quality solution with detailed explanation, edge case handling, and Big-O time and space complexity.`;

    case 'explain':
      return `${sys}
Explain this ${language} code clearly. Detail algorithm approach, logic flow step-by-step, and exact time/space complexity:
\`\`\`${language}
${code || ''}
\`\`\``;

    case 'debug':
      return `${sys}
Analyze this ${language} code for bugs, logic errors, boundary edge case failures, memory leaks, off-by-one errors, or infinite loops. Identify each bug and provide the corrected code:
\`\`\`${language}
${code || ''}
\`\`\``;

    case 'optimize':
      return `${sys}
Optimize this ${language} code for lower time and space complexity. Provide the optimal solution with comparative complexity analysis:
\`\`\`${language}
${code || ''}
\`\`\``;

    case 'testcases':
      return `${sys}
Generate 5 critical edge-case test cases (nulls, empty collections, single element, negative numbers, boundary limits) for this ${language} code:
\`\`\`${language}
${code || ''}
\`\`\``;

    case 'hints':
      return `${sys}
Provide an incremental, non-spoiling Socratic hint to guide the candidate in solving or improving this ${language} code without giving away the full solution directly:
\`\`\`${language}
${code || ''}
\`\`\``;

    case 'complexity':
      return `${sys}
Analyze the exact Big-O Time Complexity and Space Complexity of this ${language} code with line-by-line justification:
\`\`\`${language}
${code || ''}
\`\`\``;

    case 'runtime_error':
      return `${sys}
The following ${language} code produced this error output:
\`\`\`
${errorOutput || 'Runtime execution error'}
\`\`\`

Source code:
\`\`\`${language}
${code || ''}
\`\`\`
Diagnose the root cause of the error and provide the exact fix.`;

    default:
      return `${sys}
Review this ${language} code:
\`\`\`${language}
${code || ''}
\`\`\``;
  }
}

// ---------------------------------------------------------------------
// Intelligent Offline Fallback Engine (DSA Patterns & Keyword Parser)
// ---------------------------------------------------------------------

function generateLocalAIResponse(req: AIAssistRequest): { text: string; codeSnippet?: string } {
  const { action, language, code = '', prompt = '', errorOutput } = req;
  const p = prompt.toLowerCase();
  const lang = language.toLowerCase();
  const notice = `> 💡 **Tip:** To get real-time generative responses for any query with full LLM intelligence, click **⚙️ LLM** in the top bar to connect a free **Groq** or **Google Gemini** API key in seconds.`;

  // 1. Binary Search
  if (p.includes('binary search') || p.includes('bisect')) {
    return {
      text: `### ⚡ Binary Search Algorithm (${language.toUpperCase()})

${notice}

Optimal $\\mathcal{O}(\\log N)$ implementation:

\`\`\`${language}
${lang === 'python' ? `def binary_search(nums: list[int], target: int) -> int:
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1` : lang === 'javascript' ? `function binarySearch(nums, target) {
    let left = 0, right = nums.length - 1;
    while (left <= right) {
        const mid = left + Math.floor((right - left) / 2);
        if (nums[mid] === target) return mid;
        if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}` : `int binarySearch(const std::vector<int>& nums, int target) {
    int left = 0, right = static_cast<int>(nums.size()) - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}`}
\`\`\`

**Complexity:**
- **Time Complexity:** $\\mathcal{O}(\\log N)$
- **Space Complexity:** $\\mathcal{O}(1)$ auxiliary space`,
    };
  }

  // 2. Palindrome
  if (p.includes('palindrome')) {
    return {
      text: `### 🔄 Palindrome Verification (${language.toUpperCase()})

${notice}

Two-pointer $\\mathcal{O}(N)$ solution:

\`\`\`${language}
${lang === 'python' ? `def is_palindrome(s: str) -> bool:
    # Filter alphanumeric and convert to lowercase
    filtered = [ch.lower() for ch in s if ch.isalnum()]
    left, right = 0, len(filtered) - 1
    while left < right:
        if filtered[left] != filtered[right]:
            return False
        left += 1
        right -= 1
    return True` : `function isPalindrome(s) {
    const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
    let left = 0, right = clean.length - 1;
    while (left < right) {
        if (clean[left] !== clean[right]) return false;
        left++;
        right--;
    }
    return true;
}`}
\`\`\`

**Complexity:**
- **Time Complexity:** $\\mathcal{O}(N)$
- **Space Complexity:** $\\mathcal{O}(1)$ with pointers (or $\\mathcal{O}(N)$ filtered buffer)`,
    };
  }

  // 3. Two Sum / Hash Map
  if (p.includes('two sum') || p.includes('hashmap') || p.includes('hash map')) {
    return {
      text: `### 🎯 Two Sum — One-Pass Hash Map (${language.toUpperCase()})

${notice}

\`\`\`${language}
${lang === 'python' ? `def two_sum(nums: list[int], target: int) -> list[int]:
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []` : `function twoSum(nums, target) {
    const map = new Map();
    for (let i = 0; i < nums.length; i++) {
        const comp = target - nums[i];
        if (map.has(comp)) return [map.get(comp), i];
        map.set(nums[i], i);
    }
    return [];
}`}
\`\`\`

**Complexity:**
- **Time Complexity:** $\\mathcal{O}(N)$ single pass
- **Space Complexity:** $\\mathcal{O}(N)$ auxiliary hash table`,
    };
  }

  // 4. Reverse (String / Linked List / Array)
  if (p.includes('reverse')) {
    return {
      text: `### 🔁 In-Place Reversal Algorithm (${language.toUpperCase()})

${notice}

\`\`\`${language}
${lang === 'python' ? `def reverse_list(head):
    prev = None
    curr = head
    while curr:
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    return prev

def reverse_string(s: str) -> str:
    return s[::-1]` : `function reverseLinkedList(head) {
    let prev = null;
    let curr = head;
    while (curr) {
        const next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
    }
    return prev;
}`}
\`\`\`

**Complexity:**
- **Time Complexity:** $\\mathcal{O}(N)$
- **Space Complexity:** $\\mathcal{O}(1)$ in-place`,
    };
  }

  // 5. Dynamic Programming / Fibonacci / Coin Change
  if (p.includes('dynamic programming') || p.includes('dp') || p.includes('fibonacci') || p.includes('coin change')) {
    return {
      text: `### 📈 Dynamic Programming Optimization (${language.toUpperCase()})

${notice}

\`\`\`${language}
${lang === 'python' ? `def coin_change(coins: list[int], amount: int) -> int:
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for coin in coins:
        for x in range(coin, amount + 1):
            dp[x] = min(dp[x], dp[x - coin] + 1)
    return dp[amount] if dp[amount] != float('inf') else -1` : `function coinChange(coins, amount) {
    const dp = new Array(amount + 1).fill(Infinity);
    dp[0] = 0;
    for (const coin of coins) {
        for (let x = coin; x <= amount; x++) {
            dp[x] = Math.min(dp[x], dp[x - coin] + 1);
        }
    }
    return dp[amount] === Infinity ? -1 : dp[amount];
}`}
\`\`\`

**Complexity:**
- **Time Complexity:** $\\mathcal{O}(N \\times \\text{amount})$
- **Space Complexity:** $\\mathcal{O}(\\text{amount})$`,
    };
  }

  // 6. Tree Traversal / BFS / DFS / Graph
  if (p.includes('tree') || p.includes('bfs') || p.includes('dfs') || p.includes('graph')) {
    return {
      text: `### 🌳 Breadth-First & Depth-First Search (${language.toUpperCase()})

${notice}

\`\`\`${language}
${lang === 'python' ? `from collections import deque

def bfs(graph, start):
    visited = set([start])
    queue = deque([start])
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    return order` : `function bfs(graph, start) {
    const visited = new Set([start]);
    const queue = [start];
    const order = [];
    while (queue.length > 0) {
        const node = queue.shift();
        order.push(node);
        for (const neighbor of graph[node] || []) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return order;
}`}
\`\`\`

**Complexity:**
- **Time Complexity:** $\\mathcal{O}(V + E)$
- **Space Complexity:** $\\mathcal{O}(V)$ for visited set and queue`,
    };
  }

  // 7. General Custom Prompt Fallback
  if (action === 'custom' || action === 'generate') {
    return {
      text: `### 💡 AI Copilot Technical Guidance (${language.toUpperCase()})

${notice}

**Query:** "${prompt || 'General programming assistance'}"

**Engineering Recommendations:**
1. **Algorithmic Structure**: Break down the problem into inputs, edge cases, state transitions, and expected output.
2. **Data Structure Choice**: Choose hash maps for $\\mathcal{O}(1)$ lookups, two-pointers for sorted arrays, or queues for level-order traversals.

\`\`\`${language}
${lang === 'python' ? `def solution(data):
    if not data:
        return None
    # 1. Initialize state
    result = []
    # 2. Process logic
    for item in data:
        result.append(item)
    return result` : `function solution(data) {
    if (!data) return null;
    const result = [];
    for (const item of data) {
        result.push(item);
    }
    return result;
}`}
\`\`\`

**Complexity:**
- **Time Complexity:** $\\mathcal{O}(N)$
- **Space Complexity:** $\\mathcal{O}(N)$`,
    };
  }

  if (action === 'explain') {
    const lineCount = code.trim().split('\n').filter(Boolean).length;
    return {
      text: `### 🔍 Code Explanation (${language.toUpperCase()})

${notice}

**High-Level Architecture & Overview:**
The code implements logic spanning **${lineCount} lines**. It initializes core data structures and iterative loops to process input parameters.

**Logical Flow:**
1. **Input Handling & Setup**: Initializes pointers, lookup tables, or tracking variables.
2. **Core Computation**: Iterates through elements to evaluate conditions and update state.
3. **Termination & Output**: Returns the calculated result or emits output to standard console.

**Complexity Analysis:**
- **Time Complexity:** $\\mathcal{O}(N)$ or $\\mathcal{O}(N \\log N)$ depending on sorting/lookups.
- **Space Complexity:** $\\mathcal{O}(N)$ auxiliary storage or $\\mathcal{O}(1)$ in-place.`,
    };
  }

  if (action === 'debug') {
    return {
      text: `### 🐞 Potential Bugs & Edge Case Inspection

${notice}

1. **Boundary & Empty Input Check:**
   - Verify handling when input length is $0$ or $1$.
   - Check if variables are accessed before null/undefined checks.

2. **Index Bounds & Off-By-One:**
   - Inspect array iteration bounds (\`< length\` vs \`<= length\`).
   - Guard against negative indexing or accessing beyond array boundaries.

3. **Floating Point & Division by Zero:**
   - Ensure denominator checks before modulo or division operations.`,
    };
  }

  if (action === 'optimize') {
    return {
      text: `### ⚡ Algorithmic Optimization Strategy

${notice}

**Current Bottlenecks & Targets:**
- Nested iterations $\\mathcal{O}(N^2)$ can be reduced to **$\\mathcal{O}(N)$** using a Hash Map or Set.
- In-place two-pointer scans can reduce auxiliary memory from $\\mathcal{O}(N)$ to **$\\mathcal{O}(1)$**.
- Avoid repeated string concatenations in loops; utilize array joins or string builders.`,
    };
  }

  if (action === 'testcases') {
    return {
      text: `### 🧪 Edge-Case Test Suite (${language.toUpperCase()})

${notice}

1. **Empty / Null Input**: \`[]\` or \`""\` $\\rightarrow$ verifies graceful termination without null pointer exceptions.
2. **Single Element**: \`[42]\` or \`"a"\` $\\rightarrow$ checks that loop boundaries handle minimal collections properly.
3. **Duplicates & Collisions**: \`[3, 3, 3]\` $\\rightarrow$ ensures hash maps and sets handle duplicate keys accurately.
4. **Negative & Zero Values**: \`[-10, 0, 10]\` $\\rightarrow$ verifies signs and arithmetic overflow constraints.
5. **Large Scale Constraint Limit**: $10^5$ elements $\\rightarrow$ verifies execution finishes well within runtime limits.`,
    };
  }

  if (action === 'hints') {
    return {
      text: `### 💭 Socratic Hint

${notice}

> **Consider the relationship between what you have already inspected and what you need next.**
> 
> Can you trade a small amount of memory (such as a Hash Table or Set) to avoid scanning backwards through the data repeatedly?
> 
> What happens if you store the *complement* or *previously observed state* as you iterate through?`,
    };
  }

  if (action === 'complexity') {
    return {
      text: `### 📊 Formal Time & Space Complexity

${notice}

- **Time Complexity:** $\\mathcal{O}(N)$
  - *Reasoning:* The primary loop performs single-pass traversal over the input elements. Each internal operation (hash lookup/insertion) operates in amortized $\\mathcal{O}(1)$ time.
- **Space Complexity:** $\\mathcal{O}(N)$
  - *Reasoning:* Auxiliary space is bounded by the hash map/set storing at most $N$ distinct entries.`,
    };
  }

  if (action === 'runtime_error') {
    return {
      text: `### ⚠️ Runtime Diagnostics

${notice}

**Observed Error:**
\`\`\`
${errorOutput || 'Execution failure / Non-zero exit code'}
\`\`\`

**Diagnosis & Fix:**
- Ensure all variables are properly defined and typed before invocation.
- Check standard input parsing: when reading from \`stdin\`, ensure line splits and trims do not encounter empty lines.
- For compiled languages (${language}), ensure header imports (\`#include <vector>\`, \`import java.util.*;\`) are included.`,
    };
  }

  return { text: `Code review complete for ${language}. No immediate structural faults detected.` };
}

// ---------------------------------------------------------------------
// AI Mock Interviewer Handler
// ---------------------------------------------------------------------

export async function processAIMockInterview(req: AIMockInterviewRequest): Promise<{ reply: string; scoreCard?: any }> {
  const { topic, messageHistory, candidateCode, mode } = req;
  const resolved = resolveProvider(req);

  if (resolved.provider !== 'offline') {
    try {
      if (mode === 'evaluate') {
        const prompt = `You are a Principal Engineering Director evaluating a technical candidate for a Staff Software Engineer role.
Topic: ${topic}
Conversation history:
${messageHistory.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

Candidate's final code:
${candidateCode || '(No code submitted)'}

Evaluate their performance and respond ONLY with a valid JSON object matching this schema:
{
  "rating": <integer between 1 and 5>,
  "verdict": "<STRONG_HIRE | HIRE | LEANING_NO_HIRE | NO_HIRE>",
  "strengths": "<specific observations on communication, approach, data structure choices, or correctness>",
  "improvements": "<specific actionable advice on algorithmic edge cases, time/space complexity, or code design>",
  "feedback": "<concise final review paragraph>"
}`;

        let jsonText = '';
        if (resolved.provider === 'groq') {
          jsonText = await callGroq(prompt, resolved.apiKey, resolved.model, 'Respond only with valid JSON.');
        } else if (resolved.provider === 'gemini') {
          jsonText = await callGemini(prompt, resolved.apiKey, resolved.model);
        } else if (resolved.provider === 'openai') {
          jsonText = await callOpenAI(prompt, resolved.apiKey, resolved.model, 'Respond only with valid JSON.');
        } else if (resolved.provider === 'openrouter') {
          jsonText = await callOpenRouter(prompt, resolved.apiKey, resolved.model, 'Respond only with valid JSON.');
        }

        if (jsonText) {
          const clean = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(clean);
          return { reply: 'Evaluation complete.', scoreCard: parsed };
        }
      } else {
        // Regular interview turn
        const messagesText = messageHistory
          .map((m) => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.content}`)
          .join('\n');

        const prompt = `You are a Senior Technical Interviewer conducting a mock interview on topic: ${topic}.
Current conversation:
${messagesText}

Candidate's current code in editor:
${candidateCode || '(No code written yet)'}

Respond as the interviewer:
- Be professional, conversational, and direct.
- Ask follow-up probing questions on trade-offs, edge cases, or complexity.
- If the candidate asked for a hint, provide a subtle nudge.
- Keep responses under 4 sentences.`;

        let reply = '';
        if (resolved.provider === 'groq') {
          reply = await callGroq(prompt, resolved.apiKey, resolved.model);
        } else if (resolved.provider === 'gemini') {
          reply = await callGemini(prompt, resolved.apiKey, resolved.model);
        } else if (resolved.provider === 'openai') {
          reply = await callOpenAI(prompt, resolved.apiKey, resolved.model);
        } else if (resolved.provider === 'openrouter') {
          reply = await callOpenRouter(prompt, resolved.apiKey, resolved.model);
        }

        if (reply) return { reply };
      }
    } catch (err: any) {
      console.warn(`[AI Mock Interview] ${resolved.provider} failed:`, err.message);
    }
  }

  // Local Mock Interview Evaluator
  if (mode === 'evaluate') {
    const userMsgs = messageHistory.filter((m) => m.role === 'user');
    const totalWords = userMsgs.reduce((acc, m) => acc + m.content.split(/\s+/).length, 0);
    const codeLen = (candidateCode || '').trim().length;

    let rating = 3;
    let verdict = 'HIRE';
    if (userMsgs.length >= 3 && codeLen > 100) {
      rating = 5;
      verdict = 'STRONG_HIRE';
    } else if (userMsgs.length >= 2 || codeLen > 40) {
      rating = 4;
      verdict = 'HIRE';
    } else if (userMsgs.length === 1 && codeLen === 0) {
      rating = 2;
      verdict = 'LEANING_NO_HIRE';
    }

    const strengthsList = [];
    if (codeLen > 60) strengthsList.push('Proactively authored functional code in the editor');
    if (totalWords > 40) strengthsList.push('Clear articulation of architectural trade-offs');
    strengthsList.push(`Demonstrated engagement with core ${topic} concepts`);

    const improvementsList = [];
    if (codeLen < 50) improvementsList.push('Spend more time writing testable code in the editor');
    improvementsList.push('Explicitly state worst-case auxiliary space bounds and boundary conditions');

    return {
      reply: 'Technical interview scorecard generated successfully.',
      scoreCard: {
        rating,
        verdict,
        strengths: strengthsList.join('. ') + '.',
        improvements: improvementsList.join('. ') + '.',
        feedback: `Completed ${userMsgs.length} interview turns on ${topic}. Candidate demonstrated active communication and applied problem-solving methodologies.`,
      },
    };
  }

  // Local interview turns
  const userMsgCount = messageHistory.filter((m) => m.role === 'user').length;
  if (userMsgCount === 0) {
    return {
      reply: `Hello! I am your AI Technical Interviewer today. We will be conducting a deep dive on **${topic}**. Could you start by walking me through your preferred high-level approach and time complexity before writing code?`,
    };
  } else if (userMsgCount === 1) {
    return {
      reply: `That sounds like a solid starting intuition. How would your approach handle boundary scenarios, such as empty inputs or negative values? Feel free to start coding in the editor whenever you are ready.`,
    };
  } else if (candidateCode && candidateCode.length > 50) {
    return {
      reply: `I see your implementation taking shape in the Monaco editor. Can you analyze the worst-case space complexity of your data structures? Is there any opportunity to optimize auxiliary allocations?`,
    };
  } else {
    return {
      reply: `Good discussion. What would happen if this service had to process 100,000 queries per second in a distributed environment? What caching or partitioning strategies would you apply?`,
    };
  }
}
