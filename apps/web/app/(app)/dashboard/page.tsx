import Link from "next/link";
import { Users, BookOpen, BarChart3 } from "lucide-react";

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome to OpenSchool
        </h1>
        <p className="text-gray-500">
          Your school management dashboard
        </p>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/students"
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left block"
          >
            <div className="flex items-center space-x-3 mb-2">
              <Users className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">View Students</span>
            </div>
            <div className="text-sm text-gray-500">
              Manage student records
            </div>
          </Link>
          <Link
            href="/gradebook"
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left block"
          >
            <div className="flex items-center space-x-3 mb-2">
              <BookOpen className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Gradebook</span>
            </div>
            <div className="text-sm text-gray-500">
              Enter and view grades
            </div>
          </Link>
          <Link
            href="/reports"
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left block"
          >
            <div className="flex items-center space-x-3 mb-2">
              <BarChart3 className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Reports</span>
            </div>
            <div className="text-sm text-gray-500">
              Generate analytics
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

