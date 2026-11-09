"""JSON Schema for a resume (applied after `extends` has been resolved)."""

from resumake import themes

_str = {"type": "string"}
_str_list = {"type": "array", "items": _str}
_date = {"type": ["string", "integer"]}  # "2021", "2021-03", "2021-03-15", "present"

_dated = {
    "start": _date,
    "end": _date,
    "location": _str,
    "summary": _str,
    "highlights": _str_list,
}

PROJECT_STATUSES = ["in progress", "deployed", "complete"]

SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["basics"],
    "additionalProperties": False,
    "properties": {
        "basics": {
            "type": "object",
            "required": ["name"],
            "additionalProperties": False,
            "properties": {
                "name": _str,
                "label": _str,
                "email": _str,
                "phone": _str,
                "location": _str,
                "website": _str,
                "summary": _str,
                "profiles": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["network"],
                        "additionalProperties": False,
                        "properties": {"network": _str, "username": _str, "url": _str},
                    },
                },
            },
        },
        "work": {
            "type": "array",
            "items": {
                "type": "object",
                # Either a single role (`position`) or several roles at one company.
                "required": ["company"],
                "anyOf": [{"required": ["position"]}, {"required": ["roles"]}],
                "additionalProperties": False,
                "properties": {
                    "company": _str,
                    "position": _str,
                    "url": _str,
                    # Tech used in the role. Metadata for other consumers (e.g. a
                    # website's tags); the resume renderers ignore it.
                    "keywords": _str_list,
                    **_dated,
                    "roles": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "required": ["position"],
                            "additionalProperties": False,
                            "properties": {"position": _str, "keywords": _str_list, **_dated},
                        },
                    },
                },
            },
        },
        "projects": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name"],
                "additionalProperties": False,
                "properties": {
                    "name": _str,
                    "url": _str,
                    # Without a status, a project with no `end` is in progress, else complete.
                    "status": {"enum": PROJECT_STATUSES},
                    "keywords": _str_list,
                    **_dated,
                },
            },
        },
        "education": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["institution"],
                "additionalProperties": False,
                "properties": {
                    "institution": _str,
                    "degree": _str,
                    "area": _str,
                    "score": _str,
                    **_dated,
                },
            },
        },
        "skills": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name"],
                "additionalProperties": False,
                "properties": {
                    "name": _str,
                    # A flat list, or a list of groups rendered as "a, b | c, d".
                    "keywords": {"type": "array", "items": {"anyOf": [_str, _str_list]}},
                    "note": _str,
                },
            },
        },
        "certifications": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name"],
                "additionalProperties": False,
                "properties": {"name": _str, "issuer": _str, "date": _date, "url": _str},
            },
        },
        # The job a tailored resume targets. Kept for your records; never rendered.
        "job": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": _str,
                "company": _str,
                "url": _str,
                "applied": _date,
                "status": _str,
                "notes": _str,
                # Paste the posting here too: links rot once a role is filled.
                "description": _str,
            },
        },
        "layout": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "sections": {
                    "type": "array",
                    "items": {
                        "enum": [
                            "summary",
                            "work",
                            "projects",
                            "skills",
                            "education",
                            "certifications",
                        ]
                    },
                },
                "titles": {"type": "object", "additionalProperties": _str},
                "output_name": _str,
                # How the resume looks: a folder in src/resumake/themes/. Defaults to classic.
                "theme": {"enum": themes.available()},
                # Accent colour for themes that use one (e.g. modern); others ignore it.
                "accent": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
            },
        },
    },
}
