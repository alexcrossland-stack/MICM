import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAcceptInvitation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Key } from "lucide-react";

export default function OnboardingPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [success, setSuccess] = useState(false);
  const { mutateAsync: acceptInvitation, isPending } = useAcceptInvitation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, []);

  async function handleAccept() {
    if (!token) return;
    try {
      await acceptInvitation({ data: { token } });
      setSuccess(true);
      toast({ title: "Welcome!", description: "Your invitation has been accepted." });
      setTimeout(() => navigate("/"), 2000);
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Invalid or expired invitation", variant: "destructive" });
    }
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="border-card-border w-full max-w-sm">
          <CardContent className="flex flex-col items-center py-12 gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold">You're in!</h2>
            <p className="text-muted-foreground text-sm text-center">Your account has been set up. Redirecting to dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="border-card-border w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Accept Invitation</CardTitle>
              <p className="text-sm text-muted-foreground">Enter your invitation token to join</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Invitation Token</Label>
            <Input
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste your invitation token here..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Your invitation link contains the token automatically. If you have the link, open it directly.
            </p>
          </div>
          <Button onClick={handleAccept} disabled={!token || isPending} className="w-full">
            {isPending ? "Accepting..." : "Accept & Join"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
