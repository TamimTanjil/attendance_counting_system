import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { EnrollUserDialog } from "@/components/users/EnrollUserDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteUser, getUsers } from "@/services/api";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Student Management — LabSense Attendance AI" },
      {
        name: "description",
        content:
          "Browse, search and enroll lab students with multi-angle face photos for automatic attendance recognition.",
      },
      { property: "og:title", content: "Student Management — LabSense" },
      { property: "og:description", content: "Enroll and manage registered lab students." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");

  const users = useQuery({ queryKey: ["users"], queryFn: getUsers });

  const remove = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      toast.success("Student removed and embeddings deleted.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const rows = useMemo(() => {
    const list = users.data ?? [];
    return list.filter((u) => {
      const q = query.toLowerCase();
      const match = !q || u.name.toLowerCase().includes(q) || u.studentId.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      return match && (dept === "all" || u.department === dept);
    });
  }, [users.data, query, dept]);

  const departments = Array.from(new Set((users.data ?? []).map((u) => u.department)));

  return (
    <DashboardLayout
      title="Student Management"
      subtitle={`${rows.length} of ${users.data?.length ?? 0} registered profiles`}
      actions={<EnrollUserDialog onCreated={() => qc.invalidateQueries({ queryKey: ["users"] })} />}
    >
      <div className="glass-panel rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, ID or email…"
              className="pl-9"
            />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Photos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Loading profiles…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No students match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary">
                          {u.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{u.studentId}</TableCell>
                    <TableCell className="text-sm">{u.department}</TableCell>
                    <TableCell className="text-sm">{u.enrolledPhotos}</TableCell>
                    <TableCell>
                      <span
                        className={
                          u.active
                            ? "rounded-full bg-primary/15 px-2.5 py-0.5 text-xs text-primary ring-1 ring-primary/25"
                            : "rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground ring-1 ring-border"
                        }
                      >
                        {u.active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove.mutate(u.id)}
                        aria-label={`Remove ${u.name}`}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
