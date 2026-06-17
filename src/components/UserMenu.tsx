import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LogOut, LogIn, Settings, UserCircle } from "lucide-react";
import { Link } from "react-router-dom";

const UserMenu = () => {
  const { user, profile, loading, signOut } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <Link to="/login">
        <Button variant="outline" size="sm" className="gap-2">
          <LogIn className="h-4 w-4" />
          Sign in
        </Button>
      </Link>
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
        <Button
          variant="outline"
          size="default"
          className="h-11 rounded-full px-4 text-sm font-semibold shadow-sm shadow-primary/15"
        >
          <Avatar className="mr-2 h-7 w-7">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <UserCircle className="mr-1 h-4 w-4" />
          <span>Account</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">{profile?.full_name ?? "User"}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Link to="/settings">
            <Button
              variant="default"
              size="default"
              className="h-12 w-full justify-start gap-3 rounded-xl px-4 text-base font-semibold shadow-md shadow-primary/30"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-foreground/20">
                <Settings className="h-4.5 w-4.5" />
              </span>
              <span>Account settings</span>
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default UserMenu;
