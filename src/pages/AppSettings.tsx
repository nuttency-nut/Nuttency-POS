import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, User, Shield, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import { useState, useEffect } from "react";

export default function AppSettings() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    setIsDark(dark);
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.classList.toggle("dark", newDark);
    localStorage.setItem("theme", newDark ? "dark" : "light");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("ÄÃ£ Ä‘Äƒng xuáº¥t");
    navigate("/auth");
  };

  return (
    <AppLayout title="CÃ i Ä‘áº·t">
      <div className="p-4 space-y-4">
        {/* User info */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">
                  {user?.email}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary capitalize">
                    {role === "admin" ? "Quáº£n trá»‹ viÃªn" : "NhÃ¢n viÃªn"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Theme toggle */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <button
              onClick={toggleTheme}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-3">
                {isDark ? (
                  <Moon className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Sun className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="font-medium text-foreground">
                  {isDark ? "Cháº¿ Ä‘á»™ tá»‘i" : "Cháº¿ Ä‘á»™ sÃ¡ng"}
                </span>
              </div>
              <div
                className={`w-11 h-6 rounded-full transition-colors ${
                  isDark ? "bg-primary" : "bg-muted"
                } relative`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow-sm transition-transform ${
                    isDark ? "translate-x-5.5 left-0.5" : "left-0.5"
                  }`}
                />
              </div>
            </button>
          </CardContent>
        </Card>

        {/* Sign out */}
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="w-full h-12 rounded-xl gap-2 text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5"
        >
          <LogOut className="w-4 h-4" />
          ÄÄƒng xuáº¥t
        </Button>

        <p className="text-center text-xs text-muted-foreground pt-4">
          SalesPro v1.0 â€¢ Quáº£n lÃ½ bÃ¡n hÃ ng thÃ´ng minh
        </p>
      </div>
    </AppLayout>
  );
}

