import { Elysia } from "elysia";
import { db } from "../db.js";

export const announcementRoutes = new Elysia({ prefix: "/api" })

  // Get all announcements (public route)
  .get("/announcements", async ({ query }: { query: any }) => {
    try {
      const sortBy = query.sortBy || "createdAt";
      const order = query.order || "desc";

      // Validate sorting parameters
      const validSortFields = ["createdAt", "updatedAt", "title"];
      const validOrder = ["asc", "desc"];

      if (!validSortFields.includes(sortBy)) {
        return Response.json(
          {
            error:
              "Invalid sortBy field. Valid options: createdAt, updatedAt, title",
          },
          { status: 400 },
        );
      }

      if (!validOrder.includes(order)) {
        return Response.json(
          { error: "Invalid order. Valid options: asc, desc" },
          { status: 400 },
        );
      }

      const announcements = await db.announcement.findMany({
        orderBy: {
          [sortBy]: order as "asc" | "desc",
        },
      });

      return announcements;
    } catch (error) {
      console.error("Error fetching announcements:", error);
      return Response.json(
        { error: "Failed to fetch announcements" },
        { status: 500 },
      );
    }
  })

  // Get single announcement (public route)
  .get("/announcements/:id", async ({ params }: { params: { id: string } }) => {
    try {
      const announcement = await db.announcement.findUnique({
        where: {
          id: params.id,
        },
      });

      if (!announcement) {
        return Response.json(
          { error: "Announcement not found" },
          { status: 404 },
        );
      }

      return announcement;
    } catch (error) {
      console.error("Error fetching announcement:", error);
      return Response.json(
        { error: "Failed to fetch announcement" },
        { status: 500 },
      );
    }
  });
