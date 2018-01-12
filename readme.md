### Deploy on Apache

Rewrite to apply react router, .htaccess

    <IfModule mod_rewrite.c>
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </IfModule>

Reverse proxy to backend api server

    <VirtualHost *:80>
      ProxyPass "/api" "http://localhost:3001/api"
      ProxyPassReverse "/api" "http://localhost:3001/api"
    </VirtualHost>

Create a file _project_credential.js under root

    module.exports = {
        db: '',
        smtp: {
            host: '',
            user: '',
            pass: '',
        },
        emailto: '',
        wwwRoot: ''
    }