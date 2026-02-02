
## CapTableEntry
                                                      Table "public.CapTableEntry"
   Column    |           Type           | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
-------------+--------------------------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id          | uuid                     |           | not null | gen_random_uuid() | plain    |             |              | 
 companyId   | uuid                     |           | not null |                   | plain    |             |              | 
 holder_name | text                     |           | not null |                   | extended |             |              | 
 holder_rfc  | text                     |           |          |                   | extended |             |              | 
 person_type | text                     |           |          |                   | extended |             |              | 
 shares      | numeric                  |           |          |                   | main     |             |              | 
 percentage  | numeric                  |           |          |                   | main     |             |              | 
 series      | text                     |           |          |                   | extended |             |              | 
 document_id | uuid                     |           |          |                   | plain    |             |              | 
 notes       | text                     |           |          |                   | extended |             |              | 
 createdAt   | timestamp with time zone |           | not null | now()             | plain    |             |              | 
Indexes:
    "CapTableEntry_pkey" PRIMARY KEY, btree (id)
Check constraints:
    "CapTableEntry_persontype_check" CHECK (person_type = ANY (ARRAY['fisica'::text, 'moral'::text]))
Foreign-key constraints:
    "CapTableEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE
    "CapTableEntry_documentId_fkey" FOREIGN KEY (document_id) REFERENCES "CompanyDocument"(id) ON DELETE SET NULL
Access method: heap


## Company
                                                        Table "public.Company"
  Column   |           Type           | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
-----------+--------------------------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id        | uuid                     |           | not null | gen_random_uuid() | plain    |             |              | 
 name      | text                     |           | not null |                   | extended |             |              | 
 slug      | text                     |           | not null |                   | extended |             |              | 
 isActive  | boolean                  |           | not null | true              | plain    |             |              | 
 createdAt | timestamp with time zone |           | not null | now()             | plain    |             |              | 
 settings  | jsonb                    |           | not null | '{}'::jsonb       | extended |             |              | 
 rfc       | text                     |           |          |                   | extended |             |              | 
 legalName | text                     |           |          |                   | extended |             |              | 
 tradeName | text                     |           |          |                   | extended |             |              | 
 email     | text                     |           |          |                   | extended |             |              | 
 phone     | text                     |           |          |                   | extended |             |              | 
 website   | text                     |           |          |                   | extended |             |              | 
 address   | jsonb                    |           | not null | '{}'::jsonb       | extended |             |              | 
 active    | boolean                  |           | not null | true              | plain    |             |              | 
Indexes:
    "Company_pkey" PRIMARY KEY, btree (id)
    "Company_slug_key" UNIQUE CONSTRAINT, btree (slug)
    "company_brandname_idx" btree (((settings -> 'branding'::text) ->> 'brandName'::text))
    "company_settings_gin" gin (settings)
    "company_slogan_idx" btree (((settings -> 'branding'::text) ->> 'slogan'::text))
    "company_slug_unique" UNIQUE, btree (slug)
Referenced by:
    TABLE ""CapTableEntry"" CONSTRAINT "CapTableEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE
    TABLE ""CompanyDocument"" CONSTRAINT "CompanyDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE
    TABLE ""CompanyModule"" CONSTRAINT "CompanyModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE
    TABLE ""Product"" CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE
    TABLE "company_member" CONSTRAINT "company_member_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE
    TABLE "invitation" CONSTRAINT "invitation_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE
    TABLE "role" CONSTRAINT "role_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE
Access method: heap


## CompanyDocument
                                                      Table "public.CompanyDocument"
    Column    |           Type           | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
--------------+--------------------------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id           | uuid                     |           | not null | gen_random_uuid() | plain    |             |              | 
 companyId    | uuid                     |           | not null |                   | plain    |             |              | 
 category     | text                     |           | not null |                   | extended |             |              | 
 title        | text                     |           | not null |                   | extended |             |              | 
 issuedAt     | date                     |           |          |                   | plain    |             |              | 
 expiresAt    | date                     |           |          |                   | plain    |             |              | 
 notaryName   | text                     |           |          |                   | extended |             |              | 
 notaryNumber | text                     |           |          |                   | extended |             |              | 
 city         | text                     |           |          |                   | extended |             |              | 
 state        | text                     |           |          |                   | extended |             |              | 
 parties      | jsonb                    |           |          |                   | extended |             |              | 
 tags         | jsonb                    |           |          |                   | extended |             |              | 
 summary      | text                     |           |          |                   | extended |             |              | 
 text_excerpt | text                     |           |          |                   | extended |             |              | 
 storage_path | text                     |           | not null |                   | extended |             |              | 
 autodetected | boolean                  |           | not null | true              | plain    |             |              | 
 createdAt    | timestamp with time zone |           | not null | now()             | plain    |             |              | 
Indexes:
    "CompanyDocument_pkey" PRIMARY KEY, btree (id)
Check constraints:
    "CompanyDocument_category_check" CHECK (category = ANY (ARRAY['constitucion'::text, 'poder'::text, 'acta'::text, 'cap_table'::text, 'otro'::text]))
Foreign-key constraints:
    "CompanyDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE
Referenced by:
    TABLE ""CapTableEntry"" CONSTRAINT "CapTableEntry_documentId_fkey" FOREIGN KEY (document_id) REFERENCES "CompanyDocument"(id) ON DELETE SET NULL
Access method: heap


## CompanyModule
                                          Table "public.CompanyModule"
  Column   |  Type   | Collation | Nullable |   Default   | Storage  | Compression | Stats target | Description 
-----------+---------+-----------+----------+-------------+----------+-------------+--------------+-------------
 companyId | uuid    |           | not null |             | plain    |             |              | 
 moduleKey | text    |           | not null |             | extended |             |              | 
 enabled   | boolean |           | not null | true        | plain    |             |              | 
 settings  | jsonb   |           | not null | '{}'::jsonb | extended |             |              | 
Indexes:
    "CompanyModule_pkey" PRIMARY KEY, btree ("companyId", "moduleKey")
Foreign-key constraints:
    "CompanyModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE
    "CompanyModule_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "ModuleRegistry"(key) ON DELETE CASCADE
Access method: heap


## ModuleRegistry
                                     Table "public.ModuleRegistry"
 Column  | Type | Collation | Nullable | Default | Storage  | Compression | Stats target | Description 
---------+------+-----------+----------+---------+----------+-------------+--------------+-------------
 key     | text |           | not null |         | extended |             |              | 
 name    | text |           | not null |         | extended |             |              | 
 version | text |           | not null |         | extended |             |              | 
Indexes:
    "ModuleRegistry_pkey" PRIMARY KEY, btree (key)
Referenced by:
    TABLE ""CompanyModule"" CONSTRAINT "CompanyModule_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "ModuleRegistry"(key) ON DELETE CASCADE
Access method: heap


## Product
                                                Table "public.Product"
  Column   |  Type   | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
-----------+---------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id        | uuid    |           | not null | gen_random_uuid() | plain    |             |              | 
 companyId | uuid    |           | not null |                   | plain    |             |              | 
 name      | text    |           | not null |                   | extended |             |              | 
 sku       | text    |           |          |                   | extended |             |              | 
 isActive  | boolean |           | not null | true              | plain    |             |              | 
Indexes:
    "Product_pkey" PRIMARY KEY, btree (id)
    "Product_companyId_name_key" UNIQUE CONSTRAINT, btree ("companyId", name)
Foreign-key constraints:
    "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE
Access method: heap


## Role
                                                        Table "public.Role"
 Column |  Type   | Collation | Nullable |              Default               | Storage  | Compression | Stats target | Description 
--------+---------+-----------+----------+------------------------------------+----------+-------------+--------------+-------------
 id     | integer |           | not null | nextval('"Role_id_seq"'::regclass) | plain    |             |              | 
 name   | text    |           | not null |                                    | extended |             |              | 
Indexes:
    "Role_pkey" PRIMARY KEY, btree (id)
    "Role_name_key" UNIQUE CONSTRAINT, btree (name)
Access method: heap


## User
                                                          Table "public.User"
  Column   |           Type           | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
-----------+--------------------------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id        | uuid                     |           | not null | gen_random_uuid() | plain    |             |              | 
 email     | text                     |           | not null |                   | extended |             |              | 
 fullName  | text                     |           |          |                   | extended |             |              | 
 createdAt | timestamp with time zone |           | not null | now()             | plain    |             |              | 
 auth_id   | uuid                     |           |          |                   | plain    |             |              | 
Indexes:
    "User_pkey" PRIMARY KEY, btree (id)
    "User_email_key" UNIQUE CONSTRAINT, btree (email)
    "user_auth_id_unique" UNIQUE, btree (auth_id)
    "user_email_unique" UNIQUE, btree (lower(email))
Foreign-key constraints:
    "user_auth_id_fkey" FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE SET NULL
Access method: heap


## audit_log
                                                         Table "public.audit_log"
    Column     |           Type           | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
---------------+--------------------------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id            | uuid                     |           | not null | gen_random_uuid() | plain    |             |              | 
 company_id    | uuid                     |           |          |                   | plain    |             |              | 
 actor_user_id | uuid                     |           |          |                   | plain    |             |              | 
 entity_type   | text                     |           | not null |                   | extended |             |              | 
 entity_id     | text                     |           | not null |                   | extended |             |              | 
 action        | text                     |           | not null |                   | extended |             |              | 
 metadata      | jsonb                    |           | not null | '{}'::jsonb       | extended |             |              | 
 created_at    | timestamp with time zone |           | not null | now()             | plain    |             |              | 
Indexes:
    "audit_log_pkey" PRIMARY KEY, btree (id)
Access method: heap


## company_member
                                                        Table "public.company_member"
      Column      |           Type           | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
------------------+--------------------------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id               | uuid                     |           | not null | gen_random_uuid() | plain    |             |              | 
 company_id       | uuid                     |           | not null |                   | plain    |             |              | 
 user_id          | uuid                     |           | not null |                   | plain    |             |              | 
 default_location | text                     |           | not null | ''::text          | extended |             |              | 
 is_active        | boolean                  |           | not null | true              | plain    |             |              | 
 created_at       | timestamp with time zone |           | not null | now()             | plain    |             |              | 
 updated_at       | timestamp with time zone |           | not null | now()             | plain    |             |              | 
Indexes:
    "company_member_pkey" PRIMARY KEY, btree (id)
    "company_member_company_id_user_id_key" UNIQUE CONSTRAINT, btree (company_id, user_id)
Foreign-key constraints:
    "company_member_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE
    "company_member_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profile(id) ON DELETE CASCADE
Referenced by:
    TABLE "member_permission_override" CONSTRAINT "member_permission_override_company_member_id_fkey" FOREIGN KEY (company_member_id) REFERENCES company_member(id) ON DELETE CASCADE
    TABLE "member_role" CONSTRAINT "member_role_company_member_id_fkey" FOREIGN KEY (company_member_id) REFERENCES company_member(id) ON DELETE CASCADE
Access method: heap


## invitation
                                                         Table "public.invitation"
     Column     |           Type           | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
----------------+--------------------------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id             | uuid                     |           | not null | gen_random_uuid() | plain    |             |              | 
 company_id     | uuid                     |           | not null |                   | plain    |             |              | 
 email          | text                     |           | not null |                   | extended |             |              | 
 role_ids       | uuid[]                   |           | not null | '{}'::uuid[]      | extended |             |              | 
 invited_by     | uuid                     |           |          |                   | plain    |             |              | 
 token          | text                     |           | not null |                   | extended |             |              | 
 status         | text                     |           | not null | 'pending'::text   | extended |             |              | 
 expires_at     | timestamp with time zone |           | not null |                   | plain    |             |              | 
 created_at     | timestamp with time zone |           | not null | now()             | plain    |             |              | 
 role_id        | uuid                     |           |          |                   | plain    |             |              | 
 invitation_url | text                     |           |          |                   | extended |             |              | 
Indexes:
    "invitation_pkey" PRIMARY KEY, btree (id)
    "invitation_company_status_idx" btree (company_id, status, email)
    "invitation_token_key" UNIQUE CONSTRAINT, btree (token)
Foreign-key constraints:
    "invitation_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE
    "invitation_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES profile(id)
Access method: heap


## member_permission_override
                                                   Table "public.member_permission_override"
      Column       |           Type           | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
-------------------+--------------------------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id                | uuid                     |           | not null | gen_random_uuid() | plain    |             |              | 
 company_member_id | uuid                     |           | not null |                   | plain    |             |              | 
 module_id         | uuid                     |           | not null |                   | plain    |             |              | 
 permission_id     | uuid                     |           | not null |                   | plain    |             |              | 
 allowed           | boolean                  |           | not null |                   | plain    |             |              | 
 reason            | text                     |           | not null | ''::text          | extended |             |              | 
 created_at        | timestamp with time zone |           | not null | now()             | plain    |             |              | 
Indexes:
    "member_permission_override_pkey" PRIMARY KEY, btree (id)
    "member_permission_override_company_member_id_module_id_perm_key" UNIQUE CONSTRAINT, btree (company_member_id, module_id, permission_id)
Foreign-key constraints:
    "member_permission_override_company_member_id_fkey" FOREIGN KEY (company_member_id) REFERENCES company_member(id) ON DELETE CASCADE
    "member_permission_override_module_id_fkey" FOREIGN KEY (module_id) REFERENCES module(id) ON DELETE CASCADE
    "member_permission_override_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES permission(id) ON DELETE CASCADE
Access method: heap


## member_role
                                                          Table "public.member_role"
      Column       |           Type           | Collation | Nullable |      Default      | Storage | Compression | Stats target | Description 
-------------------+--------------------------+-----------+----------+-------------------+---------+-------------+--------------+-------------
 id                | uuid                     |           | not null | gen_random_uuid() | plain   |             |              | 
 company_member_id | uuid                     |           | not null |                   | plain   |             |              | 
 role_id           | uuid                     |           | not null |                   | plain   |             |              | 
 assigned_by       | uuid                     |           |          |                   | plain   |             |              | 
 created_at        | timestamp with time zone |           | not null | now()             | plain   |             |              | 
Indexes:
    "member_role_pkey" PRIMARY KEY, btree (id)
    "member_role_company_member_id_role_id_key" UNIQUE CONSTRAINT, btree (company_member_id, role_id)
Foreign-key constraints:
    "member_role_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES profile(id)
    "member_role_company_member_id_fkey" FOREIGN KEY (company_member_id) REFERENCES company_member(id) ON DELETE CASCADE
    "member_role_role_id_fkey" FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE
Access method: heap


## module
                                                Table "public.module"
  Column   |  Type   | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
-----------+---------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id        | uuid    |           | not null | gen_random_uuid() | plain    |             |              | 
 key       | text    |           | not null |                   | extended |             |              | 
 label     | text    |           | not null |                   | extended |             |              | 
 order     | integer |           | not null | 0                 | plain    |             |              | 
 is_active | boolean |           | not null | true              | plain    |             |              | 
Indexes:
    "module_pkey" PRIMARY KEY, btree (id)
    "module_key_key" UNIQUE CONSTRAINT, btree (key)
Referenced by:
    TABLE "member_permission_override" CONSTRAINT "member_permission_override_module_id_fkey" FOREIGN KEY (module_id) REFERENCES module(id) ON DELETE CASCADE
    TABLE "role_permission" CONSTRAINT "role_permission_module_id_fkey" FOREIGN KEY (module_id) REFERENCES module(id) ON DELETE CASCADE
Access method: heap


## permission
                                           Table "public.permission"
 Column | Type | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
--------+------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id     | uuid |           | not null | gen_random_uuid() | plain    |             |              | 
 key    | text |           | not null |                   | extended |             |              | 
 label  | text |           | not null |                   | extended |             |              | 
Indexes:
    "permission_pkey" PRIMARY KEY, btree (id)
    "permission_key_key" UNIQUE CONSTRAINT, btree (key)
Referenced by:
    TABLE "member_permission_override" CONSTRAINT "member_permission_override_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES permission(id) ON DELETE CASCADE
    TABLE "role_permission" CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES permission(id) ON DELETE CASCADE
Access method: heap


## profile
                                                       Table "public.profile"
   Column   |           Type           | Collation | Nullable |    Default    | Storage  | Compression | Stats target | Description 
------------+--------------------------+-----------+----------+---------------+----------+-------------+--------------+-------------
 id         | uuid                     |           | not null |               | plain    |             |              | 
 email      | text                     |           | not null |               | extended |             |              | 
 first_name | text                     |           | not null | ''::text      | extended |             |              | 
 last_name  | text                     |           | not null | ''::text      | extended |             |              | 
 phone      | text                     |           | not null | ''::text      | extended |             |              | 
 avatar_url | text                     |           | not null | ''::text      | extended |             |              | 
 locale     | text                     |           | not null | 'es-MX'::text | extended |             |              | 
 is_active  | boolean                  |           | not null | true          | plain    |             |              | 
 created_at | timestamp with time zone |           | not null | now()         | plain    |             |              | 
 updated_at | timestamp with time zone |           | not null | now()         | plain    |             |              | 
Indexes:
    "profile_pkey" PRIMARY KEY, btree (id)
    "profile_email_key" UNIQUE CONSTRAINT, btree (email)
Referenced by:
    TABLE "company_member" CONSTRAINT "company_member_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profile(id) ON DELETE CASCADE
    TABLE "invitation" CONSTRAINT "invitation_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES profile(id)
    TABLE "member_role" CONSTRAINT "member_role_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES profile(id)
Access method: heap


## role
                                                           Table "public.role"
   Column    |           Type           | Collation | Nullable |      Default      | Storage  | Compression | Stats target | Description 
-------------+--------------------------+-----------+----------+-------------------+----------+-------------+--------------+-------------
 id          | uuid                     |           | not null | gen_random_uuid() | plain    |             |              | 
 company_id  | uuid                     |           | not null |                   | plain    |             |              | 
 name        | text                     |           | not null |                   | extended |             |              | 
 description | text                     |           | not null | ''::text          | extended |             |              | 
 is_system   | boolean                  |           | not null | false             | plain    |             |              | 
 is_active   | boolean                  |           | not null | true              | plain    |             |              | 
 created_at  | timestamp with time zone |           | not null | now()             | plain    |             |              | 
 updated_at  | timestamp with time zone |           | not null | now()             | plain    |             |              | 
Indexes:
    "role_pkey" PRIMARY KEY, btree (id)
    "role_company_id_name_key" UNIQUE CONSTRAINT, btree (company_id, name)
Foreign-key constraints:
    "role_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE
Referenced by:
    TABLE "member_role" CONSTRAINT "member_role_role_id_fkey" FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE
    TABLE "role_permission" CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE
Access method: heap


## role_permission
                                             Table "public.role_permission"
    Column     |  Type   | Collation | Nullable |      Default      | Storage | Compression | Stats target | Description 
---------------+---------+-----------+----------+-------------------+---------+-------------+--------------+-------------
 id            | uuid    |           | not null | gen_random_uuid() | plain   |             |              | 
 role_id       | uuid    |           | not null |                   | plain   |             |              | 
 module_id     | uuid    |           | not null |                   | plain   |             |              | 
 permission_id | uuid    |           | not null |                   | plain   |             |              | 
 allowed       | boolean |           | not null | true              | plain   |             |              | 
Indexes:
    "role_permission_pkey" PRIMARY KEY, btree (id)
    "role_permission_role_id_module_id_permission_id_key" UNIQUE CONSTRAINT, btree (role_id, module_id, permission_id)
Foreign-key constraints:
    "role_permission_module_id_fkey" FOREIGN KEY (module_id) REFERENCES module(id) ON DELETE CASCADE
    "role_permission_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES permission(id) ON DELETE CASCADE
    "role_permission_role_id_fkey" FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE
Access method: heap

