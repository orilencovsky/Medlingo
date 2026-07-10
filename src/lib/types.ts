export interface Profile {
  userId: string;
  displayName: string;
  uiLanguage: string;
  isAdmin: boolean;
  streakCurrent: number;
  streakLongest: number;
  lastActiveDate: string | null; // 'YYYY-MM-DD'
}
