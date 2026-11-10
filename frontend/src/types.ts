export interface User {
  id: string;
  name: string;
  email: string;
  githubUsername?: string | null;
  avatarUrl?: string | null;
}

export interface RoomData {
  id: string;
  name: string;
  isPublic: boolean;
  language: string;
  hostId: string;
  problemId?: string | null;
  problemData?: string | null;
  sessionType: 'COLLAB' | 'INTERVIEW' | 'CONTEST';
  status: 'ACTIVE' | 'COMPLETED';
  isLocked: boolean;
  whiteboardData?: string | null;
  notes?: string | null;
  recordingConsent: boolean;
  host?: { id: string; name: string; email: string };
  report?: InterviewReport | null;
  participantCount?: number;
  messageCount?: number;
  submissionCount?: number;
}

export interface InterviewReport {
  id: string;
  roomId: string;
  candidateId: string;
  candidateName: string;
  interviewerId: string;
  rating: number;
  feedback: string;
  strengths: string;
  improvements: string;
  decision: 'PENDING' | 'HIRE' | 'STRONG_HIRE' | 'NO_HIRE';
  isReleased: boolean;
  createdAt: string;
}

export interface CodeCommentItem {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  lineNumber: number;
  comment: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
}

export interface CodeSnapshotItem {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  code: string;
  label?: string | null;
  createdAt: string;
}

export interface ContestItem {
  id: string;
  title: string;
  description: string;
  isPublic: boolean;
  startTime: string;
  durationMinutes: number;
  problemId: string;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  submissions?: ContestSubmissionItem[];
  _count?: { submissions: number };
}

export interface ContestSubmissionItem {
  id: string;
  contestId: string;
  userId: string;
  userName: string;
  language: string;
  code: string;
  score: number;
  passedCases: number;
  totalCases: number;
  timeMs: number;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}
