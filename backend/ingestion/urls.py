from django.urls import path
from . import views

urlpatterns = [
    # Auth / user context
    path("signup/", views.SignupView.as_view(), name="signup"),
    path("me/", views.CurrentUserView.as_view(), name="current-user"),

    # Ingestion
    path("ingest/", views.IngestView.as_view(), name="ingest"),
    path("jobs/", views.JobListView.as_view(), name="job-list"),

    # Records
    path("records/", views.RecordListView.as_view(), name="record-list"),
    path("records/bulk-action/", views.BulkActionView.as_view(), name="record-bulk-action"),
    path("records/<uuid:pk>/", views.RecordDetailView.as_view(), name="record-detail"),
    path("records/<uuid:pk>/action/", views.RecordActionView.as_view(), name="record-action"),
    path("records/<uuid:pk>/audit/", views.AuditLogView.as_view(), name="record-audit"),

    # Dashboard
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
]
