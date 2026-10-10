import { Elysia } from "elysia";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, asc, desc } from "drizzle-orm";

export const announcementRoutes = new Elysia({ prefix: "/api" })
  // Get announcements by course (public route)
  .get(
    "/announcements/course/:randomizedCourseId",
    async ({ params: { randomizedCourseId }, query }) => {
      try {
        const sortBy = (query.sortBy as string) || "createdAt";
        const order = (query.order as string) || "desc";

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

        const course = await db.query.courses.findFirst({
          where: eq(schema.courses.randomId, randomizedCourseId),
        });

        if (!course) {
          return [];
        }

        const orderFn = order === "asc" ? asc : desc;
        const sortColumn =
          sortBy === "title"
            ? schema.announcements.title
            : sortBy === "updatedAt"
              ? schema.announcements.updatedAt
              : schema.announcements.createdAt;

        const announcements = await db.query.announcements.findMany({
          where: eq(schema.announcements.courseId, course.id),
          orderBy: [orderFn(sortColumn)],
        });

        return announcements;
      } catch (error) {
        console.error("Error fetching announcements:", error);
        return Response.json(
          { error: "Failed to fetch announcements" },
          { status: 500 },
        );
      }
    },
  )

  // Get single announcement by ID (public route)
  .get("/announcements/:id", async ({ params: { id } }) => {
    try {
      const announcement = await db.query.announcements.findFirst({
        where: eq(schema.announcements.id, id),
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
