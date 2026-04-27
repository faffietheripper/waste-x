export default function AssignmentCompliancePanel({ assignment }: any) {
  return (
    <div className="bg-gray-50 border rounded-xl p-4">
      <h3 className="font-semibold mb-4">Compliance & Audit</h3>

      <div className="space-y-2 text-sm">
        <div>Verification Code: {assignment.verificationCode}</div>
        <div>Assigned: {assignment.assignedAt?.toString()}</div>
        <div>Accepted: {assignment.respondedAt?.toString()}</div>
        <div>Collected: {assignment.collectedAt?.toString()}</div>
        <div>Completed: {assignment.completedAt?.toString()}</div>
      </div>

      <button className="mt-4 bg-black text-white px-4 py-2 rounded">
        Download Report
      </button>
    </div>
  );
}
