import { buildTheme, UserError } from "@/lib/server/build-theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Upload failed: the form data couldn't be read." }, { status: 400 });
  }

  try {
    const { zip, title } = await buildTheme(form);
    const filename = `${title.replace(/[^\w\- ]+/g, "").trim() || "theme"}.zip`;
    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Theme-Filename": encodeURIComponent(filename),
      },
    });
  } catch (err) {
    if (err instanceof UserError) return Response.json({ error: err.message }, { status: 400 });
    console.error(err);
    return Response.json({ error: "Theme build failed on the server. Check the server log." }, { status: 500 });
  }
}
