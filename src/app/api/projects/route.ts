import { handleAuthenticatedApi } from "@/lib/api/auth";
import { ok, parseBody } from "@/lib/api/http";
import { createProjectSchema, listProjectsQuerySchema } from "@/lib/api/schemas";
import { createProject, listProjects } from "@/services/projects";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleAuthenticatedApi(request, async (user) => {
    const search = new URL(request.url).searchParams;
    const query = listProjectsQuerySchema.parse(Object.fromEntries(search.entries()));
    return ok(await listProjects(user.id, query));
  });
}

export async function POST(request: Request) { return handleAuthenticatedApi(request, async (user) => ok(await createProject(user.id, await parseBody(request, createProjectSchema)), 201)); }
