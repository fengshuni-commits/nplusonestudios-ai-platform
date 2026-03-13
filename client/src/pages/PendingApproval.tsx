import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function PendingApproval() {
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-auto px-6 text-center space-y-6">
        {/* Logo */}
        <div className="text-2xl font-semibold tracking-widest text-foreground/80">
          N+1 STUDIOS
        </div>

        {/* Icon */}
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Clock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">等待管理员审批</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            你的账号已注册成功，但尚未获得工作平台的访问权限。
            请联系管理员在成员管理页面批准你的账号。
          </p>
        </div>

        {/* Info box */}
        <div className="rounded-lg border bg-muted/30 p-4 text-left space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            下一步
          </p>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">1.</span>
              联系 N+1 STUDIOS 的管理员
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">2.</span>
              管理员在「管理 → 成员管理」中批准你的账号
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">3.</span>
              批准后重新登录即可访问工作平台
            </li>
          </ul>
        </div>

        {/* Logout button */}
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </Button>
      </div>
    </div>
  );
}
