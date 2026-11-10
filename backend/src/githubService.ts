export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
}

export interface GitHubFileItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  download_url?: string | null;
}

export class GitHubService {
  private static getHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'CodeMeet-Platform',
    };
  }

  static async getUserProfile(token: string) {
    const res = await fetch('https://api.github.com/user', {
      headers: this.getHeaders(token),
    });
    if (!res.ok) throw new Error('Invalid GitHub token or rate limited');
    return res.json();
  }

  static async listRepositories(token: string): Promise<GitHubRepo[]> {
    const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30', {
      headers: this.getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to fetch repositories from GitHub');
    return res.json();
  }

  static async getDirectoryContents(token: string, owner: string, repo: string, path: string = ''): Promise<GitHubFileItem[]> {
    const cleanPath = path ? `/${path}` : '';
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents${cleanPath}`, {
      headers: this.getHeaders(token),
    });
    if (!res.ok) throw new Error(`Failed to browse repo path '${path}'`);
    const data: any = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file',
      size: item.size,
      download_url: item.download_url,
    }));
  }

  static async getFileContent(token: string, owner: string, repo: string, path: string): Promise<{ content: string; sha: string }> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: this.getHeaders(token),
    });
    if (!res.ok) throw new Error(`Could not fetch file '${path}'`);
    const data: any = await res.json();
    const content = Buffer.from(data.content || '', 'base64').toString('utf8');
    return { content, sha: data.sha };
  }

  static async commitFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    content: string,
    commitMessage: string,
    branch: string = 'main',
    sha?: string
  ) {
    const payload: any = {
      message: commitMessage,
      content: Buffer.from(content).toString('base64'),
      branch,
    };
    if (sha) payload.sha = sha;

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        ...this.getHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to commit file to GitHub');
    }
    return res.json();
  }

  static async listCommits(token: string, owner: string, repo: string) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=15`, {
      headers: this.getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to retrieve commit history');
    const data: any = await res.json();
    return data.map((c: any) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    }));
  }
}
