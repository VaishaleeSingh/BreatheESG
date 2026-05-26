from django.contrib import admin
from .models import Tenant, TenantUser, EmissionFactor, IngestionJob, RawRecord, NormalizedRecord, AuditLog

admin.site.register(Tenant)
admin.site.register(TenantUser)
admin.site.register(EmissionFactor)
admin.site.register(IngestionJob)
admin.site.register(RawRecord)
admin.site.register(NormalizedRecord)
admin.site.register(AuditLog)
