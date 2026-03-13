import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Users, Shield, User, UserCheck, UserX, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function AdminTeam() {
  const { user: currentUser } = useAuth();

  const utils = trpc.useUtils();

  const { data: members = [], isLoading: loadingMembers } = trpc.admin.listUsers.useQuery();
  const { data: pending = [], isLoading: loadingPending } = trpc.admin.listPendingUsers.useQuery();

  const [confirmAction, setConfirmAction] = useState<{
    type: "approve" | "revoke";
    userId: number;
    userName: string;
  } | null>(null);

  const approveMutation = trpc.admin.approveUser.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      utils.admin.listPendingUsers.invalidate();
      toast.success("已批准成员访问权限");
      setConfirmAction(null);
    },
    onError: () => toast.error("操作失败"),
  });

  const revokeMutation = trpc.admin.revokeUser.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      utils.admin.listPendingUsers.invalidate();
      toast.success("已撤销成员访问权限");
      setConfirmAction(null);
    },
    onError: () => toast.error("操作失败"),
  });

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      toast.success("角色已更新");
    },
    onError: () => toast.error("操作失败"),
  });

  const approvedMembers = members.filter((m: any) => m.approved);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">成员管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理平台访问权限。只有获得批准的成员才能登录使用工作平台。
        </p>
      </div>

      {/* 待审批成员 */}
      {(loadingPending || pending.length > 0) && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Clock className="h-4 w-4" />
              待审批成员
              {pending.length > 0 && (
                <Badge variant="outline" className="ml-1 text-amber-700 border-amber-400 text-xs">
                  {pending.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPending ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-14 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">暂无待审批成员</p>
            ) : (
              <div className="space-y-2">
                {pending.map((member: any) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                        <User className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{member.name || "未命名用户"}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.email || member.loginMethod || "无联系方式"} · 注册于{" "}
                          {new Date(member.createdAt).toLocaleDateString("zh-CN")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                        onClick={() =>
                          setConfirmAction({ type: "approve", userId: member.id, userName: member.name || "该用户" })
                        }
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        批准
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 已批准成员 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            已批准成员
            <Badge variant="secondary" className="ml-1 text-xs">
              {approvedMembers.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMembers ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : approvedMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">暂无已批准成员</div>
          ) : (
            <div className="space-y-2">
              {approvedMembers.map((member: any) => {
                const isOwner = member.role === "admin" && member.id === currentUser?.id;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                        {member.role === "admin" ? (
                          <Shield className="h-4 w-4 text-primary" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {member.name || "未命名用户"}
                          {isOwner && (
                            <span className="ml-2 text-xs text-muted-foreground">(你)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.email || member.loginMethod || "无联系方式"} · 最近登录{" "}
                          {new Date(member.lastSignedIn).toLocaleDateString("zh-CN")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={member.role === "admin" ? "default" : "outline"}
                        className="text-xs cursor-pointer select-none"
                        onClick={() => {
                          if (isOwner) return;
                          const newRole = member.role === "admin" ? "user" : "admin";
                          updateRoleMutation.mutate({ userId: member.id, role: newRole });
                        }}
                        title={isOwner ? "无法修改自己的角色" : "点击切换角色"}
                      >
                        {member.role === "admin" ? "管理员" : "成员"}
                      </Badge>
                      {!isOwner && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            setConfirmAction({
                              type: "revoke",
                              userId: member.id,
                              userName: member.name || "该用户",
                            })
                          }
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          撤销
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 使用说明 */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>新用户通过 Manus 账号登录后，会进入待审批状态，无法访问平台功能。</p>
              <p>管理员在此页面批准后，成员即可正常使用工作平台。撤销权限后成员将无法继续使用。</p>
              <p>点击成员的角色标签可切换"管理员"与"成员"角色。</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 确认对话框 */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "approve" ? "批准成员访问" : "撤销成员权限"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "approve"
                ? `确认批准 ${confirmAction?.userName} 访问工作平台？批准后该成员可以登录并使用所有功能。`
                : `确认撤销 ${confirmAction?.userName} 的访问权限？撤销后该成员将无法登录工作平台。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.type === "revoke" ? "bg-destructive hover:bg-destructive/90" : ""}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "approve") {
                  approveMutation.mutate({ userId: confirmAction.userId });
                } else {
                  revokeMutation.mutate({ userId: confirmAction.userId });
                }
              }}
            >
              {confirmAction?.type === "approve" ? "确认批准" : "确认撤销"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
