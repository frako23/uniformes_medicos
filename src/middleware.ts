import { defineMiddleware } from "astro:middleware";
import { getCsrfToken, getSession } from "./server/auth/session";

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = new URL(context.request.url).pathname;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname === "/api/admin" || pathname.startsWith("/api/admin/");

  if (!isAdminPage && !isAdminApi) return next();

  if (pathname === "/admin/login" || pathname === "/api/admin/auth/login") return next();

  const session = await getSession(context.request);
  if (!session) {
    if (isAdminApi) {
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Debes iniciar sesión para continuar." } },
        { status: 401 },
      );
    }
    return context.redirect("/admin/login", 303);
  }

  context.locals.adminUser = session.user;
  context.locals.csrfToken = getCsrfToken(context.request);
  return next();
});
