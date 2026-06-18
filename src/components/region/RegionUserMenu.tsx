import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LogOut, Settings as SettingsIcon } from "lucide-react";

/**
 * Account pill for region pages. Trigger uses the .user-menu-pill design-system
 * class; the dropdown is the existing shadcn Popover (its content lives in the
 * shadcn theme, which is fine since it floats above the cmt-themed page).
 *
 * Signed-out: starts Google OAuth in place (the standalone /login page was
 * removed); OAuth lands back on the current region URL.
 */
export default function RegionUserMenu() {
  const { user, profile, loading, signOut, signInWithGoogle } = useAuth();
  if (loading) return null;

  if (!user) {
    return (
      <button
        type="button"
        className="user-menu-pill"
        onClick={() => void signInWithGoogle(window.location.pathname + window.location.search)}
      >
        <span>Sign in</span>
      </button>
    );
  }

  const initials = (profile?.full_name ?? user.email ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="user-menu-pill">
          <span className="avi">{initials}</span>
          <span>Account</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">{profile?.full_name ?? "User"}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Link to="/settings" className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
            <SettingsIcon className="h-4 w-4" /> Account settings
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
