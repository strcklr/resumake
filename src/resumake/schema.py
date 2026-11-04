"""JSON Schema for a resume (applied after `extends` has been resolved)."""

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
                "required": ["company", "position"],
                "additionalProperties": False,
                "properties": {"company": _str, "position": _str, "url": _str, **_dated},
            },
        },
        "projects": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name"],
                "additionalProperties": False,
                "properties": {"name": _str, "url": _str, "keywords": _str_list, **_dated},
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
                "properties": {"name": _str, "keywords": _str_list},
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
            },
        },
    },
}
