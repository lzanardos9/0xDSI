{{- define "collector.name" -}}
0xdsi-collector
{{- end }}

{{- define "collector.fullname" -}}
{{ .Release.Name }}-0xdsi-collector
{{- end }}
