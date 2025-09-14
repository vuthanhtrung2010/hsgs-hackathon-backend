import { Elysia } from 'elysia';
import { db } from '../db.js';
import { env } from '../env.js';

export const adminRoutes = new Elysia({ prefix: '/api/admin' })
  
  // Get dashboard stats
  .get('/stats', async () => {
    try {
      const [classCount, totalStudents, canvasUserCount, announcementCount] = await Promise.all([
        db.class.count(),
        db.class.findMany().then(classes => 
          classes.reduce((total, cls) => total + cls.students.length, 0)
        ),
        db.canvasUser.count(),
        db.announcement.count()
      ]);

      return {
        success: true,
        stats: {
          classCount,
          totalStudents,
          canvasUserCount,
          announcementCount,
        }
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      return {
        success: false,
        error: 'Failed to fetch dashboard stats'
      };
    }
  })

  // Get all classes with member counts
  .get('/classes', async () => {
    try {
      const classes = await db.class.findMany({
        orderBy: {
          name: 'asc'
        }
      });

      // Add member counts (length of students array)
      const classesWithCounts = classes.map((classItem) => ({
        id: classItem.id,
        name: classItem.name,
        memberCount: classItem.students.length,
        createdAt: classItem.createdAt,
        updatedAt: classItem.updatedAt
      }));

      return {
        success: true,
        classes: classesWithCounts
      };
    } catch (error) {
      console.error('Error fetching classes:', error);
      return {
        success: false,
        error: 'Failed to fetch classes'
      };
    }
  })

  // Create a new class
  .post('/classes', async ({ body }: { body: any }) => {
    try {
      const { name, userNames } = body;

      if (!name) {
        return {
          success: false,
          error: 'Class name is required'
        };
      }

      // Parse user names into array
      let students: string[] = [];
      if (userNames && typeof userNames === 'string') {
        students = userNames
          .split(',')
          .map((name: string) => name.trim())
          .filter((name: string) => name.length > 0);
      }

      // Create the class
      const newClass = await db.class.create({
        data: {
          name: name,
          students: students
        }
      });

      return {
        success: true,
        class: newClass,
        message: `Class "${name}" created successfully with ${students.length} students`
      };
    } catch (error) {
      console.error('Error creating class:', error);
      return {
        success: false,
        error: 'Failed to create class'
      };
    }
  })

  // Get class details with members
  .get('/classes/:id', async ({ params }: { params: { id: string } }) => {
    try {
      const classDetails = await db.class.findUnique({
        where: { id: params.id }
      });

      if (!classDetails) {
        return {
          success: false,
          error: 'Class not found'
        };
      }

      return {
        success: true,
        class: {
          id: classDetails.id,
          name: classDetails.name,
          students: classDetails.students,
          memberCount: classDetails.students.length,
          createdAt: classDetails.createdAt,
          updatedAt: classDetails.updatedAt
        }
      };
    } catch (error) {
      console.error('Error fetching class details:', error);
      return {
        success: false,
        error: 'Failed to fetch class details'
      };
    }
  })

  // Update class students
  .put('/classes/:id', async ({ params, body }: { params: { id: string }, body: any }) => {
    try {
      const { students } = body;

      if (!Array.isArray(students)) {
        return {
          success: false,
          error: 'Students must be an array'
        };
      }

      // Validate that all students are strings
      const validStudents = students.filter((student: any) => 
        typeof student === 'string' && student.trim().length > 0
      ).map((student: string) => student.trim());

      const updatedClass = await db.class.update({
        where: { id: params.id },
        data: {
          students: validStudents
        }
      });

      return {
        success: true,
        class: {
          id: updatedClass.id,
          name: updatedClass.name,
          students: updatedClass.students,
          memberCount: updatedClass.students.length,
          createdAt: updatedClass.createdAt,
          updatedAt: updatedClass.updatedAt
        },
        message: `Class updated successfully with ${validStudents.length} students`
      };
    } catch (error) {
      console.error('Error updating class:', error);
      return {
        success: false,
        error: 'Failed to update class'
      };
    }
  })

  // Announcement routes
  // Get all announcements
  .get('/announcements', async () => {
    try {
      const announcements = await db.announcement.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });

      return {
        success: true,
        announcements
      };
    } catch (error) {
      console.error('Error fetching announcements:', error);
      return {
        success: false,
        error: 'Failed to fetch announcements'
      };
    }
  })

  // Create announcement
  .post('/announcements', async ({ body }: { body: any }) => {
    try {
      const { title } = body;

      if (!title || !title.trim()) {
        return {
          success: false,
          error: 'Title is required'
        };
      }

      const newAnnouncement = await db.announcement.create({
        data: {
          title: title.trim(),
          content: ''
        }
      });

      return {
        success: true,
        announcement: newAnnouncement
      };
    } catch (error) {
      console.error('Error creating announcement:', error);
      return {
        success: false,
        error: 'Failed to create announcement'
      };
    }
  })

  // Get single announcement
  .get('/announcements/:id', async ({ params }: { params: { id: string } }) => {
    try {
      const announcement = await db.announcement.findUnique({
        where: { id: params.id }
      });

      if (!announcement) {
        return {
          success: false,
          error: 'Announcement not found'
        };
      }

      return {
        success: true,
        announcement
      };
    } catch (error) {
      console.error('Error fetching announcement:', error);
      return {
        success: false,
        error: 'Failed to fetch announcement'
      };
    }
  })

  // Update announcement
  .put('/announcements/:id', async ({ params, body }: { params: { id: string }, body: any }) => {
    try {
      const { title, content } = body;

      if (!title || !title.trim()) {
        return {
          success: false,
          error: 'Title is required'
        };
      }

      const updatedAnnouncement = await db.announcement.update({
        where: { id: params.id },
        data: {
          title: title.trim(),
          content: content || ''
        }
      });

      return {
        success: true,
        announcement: updatedAnnouncement
      };
    } catch (error) {
      console.error('Error updating announcement:', error);
      return {
        success: false,
        error: 'Failed to update announcement'
      };
    }
  })

  // Delete announcement
  .delete('/announcements/:id', async ({ params }: { params: { id: string } }) => {
    try {
      await db.announcement.delete({
        where: { id: params.id }
      });

      return {
        success: true,
        message: 'Announcement deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting announcement:', error);
      return {
        success: false,
        error: 'Failed to delete announcement'
      };
    }
  });