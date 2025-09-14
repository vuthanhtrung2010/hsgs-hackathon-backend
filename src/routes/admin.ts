import { Elysia } from 'elysia';
import { db } from '../db.js';
import { env } from '../env.js';

export const adminRoutes = new Elysia({ prefix: '/api/admin' })
  
  // Get dashboard stats
  .get('/stats', async () => {
    try {
      const [classCount, totalStudents, canvasUserCount] = await Promise.all([
        db.class.count(),
        db.class.findMany().then(classes => 
          classes.reduce((total, cls) => total + cls.students.length, 0)
        ),
        db.canvasUser.count()
      ]);

      return {
        success: true,
        stats: {
          classCount,
          totalStudents,
          canvasUserCount,
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
  });