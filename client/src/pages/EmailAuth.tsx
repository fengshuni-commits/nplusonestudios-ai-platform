import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { getLoginUrl } from "@/const";

export default function EmailAuth() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"login" | "register">("login");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState(false);

  const loginMutation = trpc.auth.emailLogin.useMutation({
    onSuccess: (data) => {
      if (data.status === "pending_approval") {
        navigate("/pending-approval");
      } else {
        window.location.href = "/";
      }
    },
    onError: (err) => {
      setLoginError(err.message || "登录失败，请重试");
    },
  });

  const registerMutation = trpc.auth.emailRegister.useMutation({
    onSuccess: () => {
      setRegSuccess(true);
    },
    onError: (err) => {
      setRegError(err.message || "注册失败，请重试");
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!loginEmail || !loginPassword) {
      setLoginError("请填写邮箱和密码");
      return;
    }
    loginMutation.mutate({ email: loginEmail, password: loginPassword });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    if (!regName || !regEmail || !regPassword || !regPassword2) {
      setRegError("请填写所有必填项");
      return;
    }
    if (regPassword !== regPassword2) {
      setRegError("两次输入的密码不一致");
      return;
    }
    if (regPassword.length < 8) {
      setRegError("密码至少需要 8 位");
      return;
    }
    registerMutation.mutate({ email: regEmail, name: regName, password: regPassword });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663304605552/fRco6A2SeYp4EEqicyDKLT/nplus1-logo-transparent_aaa215a8.png"
            alt="N+1 STUDIOS"
            className="h-10 w-auto object-contain brightness-0 invert"
          />
          <div className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
            AI 工作平台
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register">注册</TabsTrigger>
          </TabsList>

          {/* Login Tab */}
          <TabsContent value="login">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">邮箱登录</CardTitle>
                <CardDescription>使用注册时的邮箱和密码登录</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  {loginError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{loginError}</AlertDescription>
                    </Alert>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">邮箱</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="your@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">密码</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="输入密码"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                    {loginMutation.isPending ? "登录中..." : "登录"}
                  </Button>
                </form>

                {/* Divider */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">或</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={() => { window.location.href = getLoginUrl(); }}
                >
                  使用 Manus 账号登录
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Register Tab */}
          <TabsContent value="register">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">注册账号</CardTitle>
                <CardDescription>注册后需等待管理员审批，审批通过后方可使用平台功能</CardDescription>
              </CardHeader>
              <CardContent>
                {regSuccess ? (
                  <div className="space-y-4 text-center py-4">
                    <div className="h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
                      <svg className="h-7 w-7 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">注册成功，等待审批</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        管理员将在收到通知后审批你的账号，审批通过后即可登录使用。
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-transparent"
                      onClick={() => navigate("/pending-approval")}
                    >
                      查看审批状态
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleRegister} className="space-y-4">
                    {regError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{regError}</AlertDescription>
                      </Alert>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-name">姓名</Label>
                      <Input
                        id="reg-name"
                        type="text"
                        placeholder="你的姓名"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        autoComplete="name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-email">邮箱</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        placeholder="your@email.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-password">密码</Label>
                      <Input
                        id="reg-password"
                        type="password"
                        placeholder="至少 8 位"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-password2">确认密码</Label>
                      <Input
                        id="reg-password2"
                        type="password"
                        placeholder="再次输入密码"
                        value={regPassword2}
                        onChange={(e) => setRegPassword2(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                      {registerMutation.isPending ? "注册中..." : "注册"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Back link */}
        <div className="text-center">
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-3 w-3" />
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
