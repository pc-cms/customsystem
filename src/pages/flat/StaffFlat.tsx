/**
 * Phase 2 flat-URL wrappers for the Floor Staff shell (Floor / Security / Office).
 * One URL per (tab, group) pair so the access matrix gates each surface
 * by ModuleKey instead of relying on `?tab=` and `?group=`.
 */
import Staff from "@/pages/Staff";
import ManagementSchedulePage from "@/pages/management/ManagementSchedulePage";

export const StaffEmployeesPage = () => <Staff forcedTab="employee" />;

export const RotaFloorPage = () => <Staff forcedTab="rota_floor" />;
export const RotaSecurityPage = () => <Staff forcedTab="rota_security" />;
export const RotaManagementPage = () => <ManagementSchedulePage mode="rota" />;
export const RotaOfficePage = () => <Staff forcedTab="rota_office" />;

export const AttendanceFloorPage = () => <Staff forcedTab="attendance" forcedGroup="floor" />;
export const AttendanceSecurityPage = () => <Staff forcedTab="attendance" forcedGroup="security" />;
export const AttendanceOfficePage = () => <Staff forcedTab="attendance" forcedGroup="office" />;
export const AttendanceManagementPage = () => <ManagementSchedulePage mode="attendance" />;
