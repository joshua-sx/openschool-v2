-- Enable Row Level Security (RLS) for all tables
-- This provides database-level security as a safety net alongside application-level checks

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;

-- Users can only see organizations they belong to
CREATE POLICY "org_select_member" ON "organizations"
  FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM users_on_org
      WHERE user_id = auth.uid()
    )
  );

-- Only org_admins can modify organizations
CREATE POLICY "org_modify_admin" ON "organizations"
  FOR ALL
  USING (
    id IN (
      SELECT org_id FROM users_on_org
      WHERE user_id = auth.uid() AND role = 'org_admin'
    )
  );

-- ============================================================================
-- SCHOOLS
-- ============================================================================
ALTER TABLE "schools" ENABLE ROW LEVEL SECURITY;

-- Users can see schools if they have org membership OR direct school membership
CREATE POLICY "school_select_member" ON "schools"
  FOR SELECT
  USING (
    -- User is member of the org that owns the school
    org_id IN (
      SELECT org_id FROM users_on_org
      WHERE user_id = auth.uid()
    )
    OR
    -- User is directly assigned to the school
    id IN (
      SELECT school_id FROM users_on_school
      WHERE user_id = auth.uid()
    )
  );

-- Only org_admins or school_admins can modify schools
CREATE POLICY "school_modify_admin" ON "schools"
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM users_on_org
      WHERE user_id = auth.uid() AND role = 'org_admin'
    )
    OR
    id IN (
      SELECT school_id FROM users_on_school
      WHERE user_id = auth.uid() AND role = 'school_admin'
    )
  );

-- ============================================================================
-- CLASSES
-- ============================================================================
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;

-- Select: org members, school members, or assigned teachers
CREATE POLICY "class_select_member" ON "classes"
  FOR SELECT
  USING (
    -- User is member of org that owns the school
    school_id IN (
      SELECT s.id FROM schools s
      JOIN users_on_org uoo ON s.org_id = uoo.org_id
      WHERE uoo.user_id = auth.uid()
    )
    OR
    -- User is directly assigned to the school
    school_id IN (
      SELECT school_id FROM users_on_school
      WHERE user_id = auth.uid()
    )
    OR
    -- User is a teacher assigned to this class
    id IN (
      SELECT class_id FROM teachers_on_class
      WHERE user_id = auth.uid()
    )
  );

-- Only org_admins or school_admins can modify classes
CREATE POLICY "class_modify_admin" ON "classes"
  FOR ALL
  USING (
    school_id IN (
      SELECT s.id FROM schools s
      JOIN users_on_org uoo ON s.org_id = uoo.org_id
      WHERE uoo.user_id = auth.uid() AND uoo.role = 'org_admin'
    )
    OR
    school_id IN (
      SELECT school_id FROM users_on_school
      WHERE user_id = auth.uid() AND role = 'school_admin'
    )
  );

-- ============================================================================
-- STUDENTS
-- ============================================================================
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;

-- Select: org/school staff OR parents of the student
CREATE POLICY "student_select_member" ON "students"
  FOR SELECT
  USING (
    -- User is member of org that owns the school
    school_id IN (
      SELECT s.id FROM schools s
      JOIN users_on_org uoo ON s.org_id = uoo.org_id
      WHERE uoo.user_id = auth.uid()
    )
    OR
    -- User is directly assigned to the school
    school_id IN (
      SELECT school_id FROM users_on_school
      WHERE user_id = auth.uid()
    )
    OR
    -- User is a parent of this student
    id IN (
      SELECT student_id FROM parent_student
      WHERE parent_id = auth.uid()
    )
  );

-- Only org_admins, school_admins, or staff can modify students
CREATE POLICY "student_modify_staff" ON "students"
  FOR ALL
  USING (
    school_id IN (
      SELECT s.id FROM schools s
      JOIN users_on_org uoo ON s.org_id = uoo.org_id
      WHERE uoo.user_id = auth.uid() AND uoo.role = 'org_admin'
    )
    OR
    school_id IN (
      SELECT school_id FROM users_on_school
      WHERE user_id = auth.uid() AND role IN ('school_admin', 'staff')
    )
  );

-- ============================================================================
-- ENROLLMENTS
-- ============================================================================
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;

-- Select: staff, teachers of the class, or parents of the student
CREATE POLICY "enrollment_select_member" ON "enrollments"
  FOR SELECT
  USING (
    -- User has access to the student's school
    student_id IN (
      SELECT id FROM students WHERE
        school_id IN (SELECT school_id FROM users_on_school WHERE user_id = auth.uid())
        OR school_id IN (
          SELECT s.id FROM schools s
          JOIN users_on_org uoo ON s.org_id = uoo.org_id
          WHERE uoo.user_id = auth.uid()
        )
    )
    OR
    -- User is a teacher of the class
    class_id IN (
      SELECT class_id FROM teachers_on_class WHERE user_id = auth.uid()
    )
    OR
    -- User is a parent of the student
    student_id IN (
      SELECT student_id FROM parent_student WHERE parent_id = auth.uid()
    )
  );

-- Only admins and staff can modify enrollments
CREATE POLICY "enrollment_modify_staff" ON "enrollments"
  FOR ALL
  USING (
    student_id IN (
      SELECT id FROM students WHERE
        school_id IN (
          SELECT school_id FROM users_on_school
          WHERE user_id = auth.uid() AND role IN ('school_admin', 'staff')
        )
        OR school_id IN (
          SELECT s.id FROM schools s
          JOIN users_on_org uoo ON s.org_id = uoo.org_id
          WHERE uoo.user_id = auth.uid() AND uoo.role = 'org_admin'
        )
    )
  );

-- ============================================================================
-- GRADES
-- ============================================================================
ALTER TABLE "grades" ENABLE ROW LEVEL SECURITY;

-- Select: staff, teachers of the class, or parents of the student
CREATE POLICY "grades_select_member" ON "grades"
  FOR SELECT
  USING (
    enrollment_id IN (
      SELECT e.id FROM enrollments e
      JOIN students s ON e.student_id = s.id
      WHERE s.school_id IN (
        SELECT school_id FROM users_on_school WHERE user_id = auth.uid()
      )
    )
    OR
    enrollment_id IN (
      SELECT e.id FROM enrollments e
      JOIN students s ON e.student_id = s.id
      JOIN schools sc ON s.school_id = sc.id
      JOIN users_on_org uoo ON sc.org_id = uoo.org_id
      WHERE uoo.user_id = auth.uid()
    )
    OR
    enrollment_id IN (
      SELECT e.id FROM enrollments e
      WHERE e.class_id IN (
        SELECT class_id FROM teachers_on_class WHERE user_id = auth.uid()
      )
    )
    OR
    enrollment_id IN (
      SELECT e.id FROM enrollments e
      WHERE e.student_id IN (
        SELECT student_id FROM parent_student WHERE parent_id = auth.uid()
      )
    )
  );

-- Teachers can only modify grades for their own classes, admins can modify all
CREATE POLICY "grades_modify_teacher" ON "grades"
  FOR ALL
  USING (
    -- Teachers for this class
    enrollment_id IN (
      SELECT e.id FROM enrollments e
      WHERE e.class_id IN (
        SELECT class_id FROM teachers_on_class WHERE user_id = auth.uid()
      )
    )
    OR
    -- School admins
    enrollment_id IN (
      SELECT e.id FROM enrollments e
      JOIN students s ON e.student_id = s.id
      WHERE s.school_id IN (
        SELECT school_id FROM users_on_school
        WHERE user_id = auth.uid() AND role = 'school_admin'
      )
    )
    OR
    -- Org admins
    enrollment_id IN (
      SELECT e.id FROM enrollments e
      JOIN students s ON e.student_id = s.id
      JOIN schools sc ON s.school_id = sc.id
      JOIN users_on_org uoo ON sc.org_id = uoo.org_id
      WHERE uoo.user_id = auth.uid() AND uoo.role = 'org_admin'
    )
  );

-- ============================================================================
-- USERS
-- ============================================================================
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

-- Users can see themselves
CREATE POLICY "users_select_self" ON "users"
  FOR SELECT
  USING (id = auth.uid());

-- Users can see colleagues in same org or school
CREATE POLICY "users_select_colleagues" ON "users"
  FOR SELECT
  USING (
    id IN (
      SELECT user_id FROM users_on_org
      WHERE org_id IN (SELECT org_id FROM users_on_org WHERE user_id = auth.uid())
    )
    OR
    id IN (
      SELECT user_id FROM users_on_school
      WHERE school_id IN (SELECT school_id FROM users_on_school WHERE user_id = auth.uid())
    )
  );

-- Users can only update themselves
CREATE POLICY "users_update_self" ON "users"
  FOR UPDATE
  USING (id = auth.uid());

-- ============================================================================
-- MEMBERSHIP TABLES
-- ============================================================================

-- users_on_org
ALTER TABLE "users_on_org" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_on_org_select" ON "users_on_org"
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR org_id IN (SELECT org_id FROM users_on_org WHERE user_id = auth.uid())
  );

CREATE POLICY "users_on_org_modify_admin" ON "users_on_org"
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM users_on_org
      WHERE user_id = auth.uid() AND role = 'org_admin'
    )
  );

-- users_on_school
ALTER TABLE "users_on_school" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_on_school_select" ON "users_on_school"
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR school_id IN (SELECT school_id FROM users_on_school WHERE user_id = auth.uid())
  );

CREATE POLICY "users_on_school_modify_admin" ON "users_on_school"
  FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM users_on_school
      WHERE user_id = auth.uid() AND role = 'school_admin'
    )
    OR
    school_id IN (
      SELECT s.id FROM schools s
      JOIN users_on_org uoo ON s.org_id = uoo.org_id
      WHERE uoo.user_id = auth.uid() AND uoo.role = 'org_admin'
    )
  );

-- teachers_on_class
ALTER TABLE "teachers_on_class" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teachers_on_class_select" ON "teachers_on_class"
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR class_id IN (SELECT class_id FROM teachers_on_class WHERE user_id = auth.uid())
    OR class_id IN (
      SELECT c.id FROM classes c
      JOIN users_on_school uos ON c.school_id = uos.school_id
      WHERE uos.user_id = auth.uid()
    )
    OR class_id IN (
      SELECT c.id FROM classes c
      JOIN schools s ON c.school_id = s.id
      JOIN users_on_org uoo ON s.org_id = uoo.org_id
      WHERE uoo.user_id = auth.uid()
    )
  );

CREATE POLICY "teachers_on_class_modify_admin" ON "teachers_on_class"
  FOR ALL
  USING (
    class_id IN (
      SELECT c.id FROM classes c
      JOIN users_on_school uos ON c.school_id = uos.school_id
      WHERE uos.user_id = auth.uid() AND uos.role = 'school_admin'
    )
    OR
    class_id IN (
      SELECT c.id FROM classes c
      JOIN schools s ON c.school_id = s.id
      JOIN users_on_org uoo ON s.org_id = uoo.org_id
      WHERE uoo.user_id = auth.uid() AND uoo.role = 'org_admin'
    )
  );

-- parent_student
ALTER TABLE "parent_student" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parent_student_select_self" ON "parent_student"
  FOR SELECT
  USING (parent_id = auth.uid());

-- Staff and admins can view parent-student relationships
CREATE POLICY "parent_student_select_staff" ON "parent_student"
  FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM students WHERE
        school_id IN (SELECT school_id FROM users_on_school WHERE user_id = auth.uid())
        OR school_id IN (
          SELECT s.id FROM schools s
          JOIN users_on_org uoo ON s.org_id = uoo.org_id
          WHERE uoo.user_id = auth.uid()
        )
    )
  );

CREATE POLICY "parent_student_modify_staff" ON "parent_student"
  FOR ALL
  USING (
    student_id IN (
      SELECT id FROM students WHERE
        school_id IN (
          SELECT school_id FROM users_on_school
          WHERE user_id = auth.uid() AND role IN ('school_admin', 'staff')
        )
        OR school_id IN (
          SELECT s.id FROM schools s
          JOIN users_on_org uoo ON s.org_id = uoo.org_id
          WHERE uoo.user_id = auth.uid() AND uoo.role = 'org_admin'
        )
    )
  );

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- Only org_admins and school_admins can read audit logs
CREATE POLICY "audit_logs_select_admin" ON "audit_logs"
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users_on_org
      WHERE user_id = auth.uid() AND role = 'org_admin'
    )
    OR
    school_id IN (
      SELECT school_id FROM users_on_school
      WHERE user_id = auth.uid() AND role = 'school_admin'
    )
  );

-- Anyone authenticated can insert audit logs (system creates these)
CREATE POLICY "audit_logs_insert_authenticated" ON "audit_logs"
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Audit logs cannot be updated or deleted
-- No UPDATE or DELETE policies = immutable audit trail
