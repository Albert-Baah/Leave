export type Role = 'employee' | 'manager' | 'admin';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type CountMode = 'working' | 'calendar';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  managerId: number | null;
  managerName?: string | null;
  startDate: string;
  active: boolean;
  pending: boolean;
  createdAt?: string;
}

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  daysPerYear: number | null;
  countMode: CountMode;
  paid: boolean;
  carryoverCap: number;
  color: string;
  description: string | null;
  sortOrder?: number;
  active: boolean;
}

export interface Balance {
  leaveTypeId: number;
  code: string;
  name: string;
  color: string;
  description: string | null;
  countMode: CountMode;
  paid: boolean;
  daysPerYear: number | null;
  carryoverCap: number;
  unlimited: boolean;
  entitled: number | null;
  carryover: number;
  approved: number;
  pending: number;
  available: number | null;
}

export interface LeaveRequest {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  department: string | null;
  leaveTypeId: number;
  leaveType: string;
  color: string;
  countMode: CountMode;
  daysPerYear: number | null;
  unlimited: boolean;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  days: number;
  reason: string | null;
  handover: string | null;
  status: RequestStatus;
  decidedBy: number | null;
  decidedByName: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
  createdAt: string;
  available?: number | null;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

export interface DashboardData {
  year: number;
  companyName: string;
  balances: Balance[];
  recentRequests: LeaveRequest[];
  pendingMine: number;
  pendingApprovals: LeaveRequest[];
  pendingApprovalsCount: number;
  upcomingHolidays: Holiday[];
  manager: { id: number; name: string } | null;
}

export interface Session {
  user: User;
  companyName: string;
}

export interface CalendarData {
  month: string;
  scope: string;
  events: LeaveRequest[];
  holidays: Holiday[];
}

export interface EntitlementType {
  id: number;
  name: string;
  daysPerYear: number;
  countMode: CountMode;
  color: string;
}

export interface EntitlementRow {
  userId: number;
  userName: string;
  department: string | null;
  startDate: string;
  typeId: number;
  entitledDays: number | null;
  carryoverDays: number | null;
  approvedDays: number;
}

export interface EntitlementData {
  year: number;
  types: EntitlementType[];
  rows: EntitlementRow[];
}

export interface ReportSummary {
  year: number;
  byStatus: Partial<Record<RequestStatus, { count: number; days: number }>>;
  daysByType: { name: string; color: string; requests: number; days: number }[];
  headcount: number;
  pending: number;
  onLeaveToday: number;
}
