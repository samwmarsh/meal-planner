# AWS Setup Guide — Meal Planner

One-time setup to deploy the meal planner on AWS Free Tier.

**Architecture:** Single EC2 t2.micro running the full docker-compose stack, auto-deployed via CodeDeploy on push to main.

---

## Step 1: Launch EC2 Instance

1. Go to **EC2 > Launch Instance**
2. Configure:
   - **Name:** `meal-planner`
   - **AMI:** Amazon Linux 2023 (free tier eligible)
   - **Instance type:** `t2.micro` (free tier: 750 hrs/month for 12 months)
   - **Key pair:** Create new → download the `.pem` file (you'll need it for SSH)
   - **Network settings:**
     - Allow SSH (22) from **My IP** only
     - Allow HTTP (80) from **Anywhere** (0.0.0.0/0)
   - **Storage:** 20 GB gp3
3. Click **Launch instance**

### Attach an Elastic IP (prevents DNS change on stop/start)

1. Go to **EC2 > Elastic IPs > Allocate Elastic IP address**
2. Select the new IP → **Actions > Associate** → choose your `meal-planner` instance
3. Note the **Public IPv4 DNS** (e.g. `ec2-1-2-3-4.eu-west-2.compute.amazonaws.com`)

---

## Step 2: Create IAM Role for EC2

1. Go to **IAM > Roles > Create role**
2. **Trusted entity:** AWS service → EC2
3. **Permissions:** Attach `AmazonEC2RoleforAWSCodeDeploy`
4. **Name:** `meal-planner-ec2-role`
5. Go to **EC2 > Instances** → select your instance → **Actions > Security > Modify IAM role** → select `meal-planner-ec2-role`

---

## Step 3: SSH In and Set Up the Instance

```bash
ssh -i your-key.pem ec2-user@<your-ec2-public-dns>
```

### Install Docker

```bash
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ec2-user
```

### Install Docker Compose + BuildX plugins

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins

# Docker Compose
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# BuildX (must be v0.17.0+ for compose build to work)
sudo curl -SL "https://github.com/docker/buildx/releases/download/v0.22.0/buildx-v0.22.0.linux-amd64" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
```

### Install CodeDeploy agent

```bash
sudo dnf install -y ruby wget
cd /home/ec2-user
# Change the region in the URL if you're not using eu-west-2
wget https://aws-codedeploy-eu-west-2.s3.eu-west-2.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto
sudo systemctl enable codedeploy-agent
sudo systemctl start codedeploy-agent
```

### Add swap (Docker builds need >1 GB RAM)

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

### Install cronie (for crontab — not included in Amazon Linux 2023 by default)

```bash
sudo dnf install -y cronie
sudo systemctl enable crond
sudo systemctl start crond
```

### Verify everything

```bash
# Log out and back in for docker group to take effect
exit
ssh -i your-key.pem ec2-user@<your-ec2-public-dns>

docker --version
docker compose version
docker buildx version    # must be v0.17.0+
crontab -l               # should work without error
sudo systemctl status codedeploy-agent
free -h                  # should show swap
```

---

## Step 4: Create the .env File on EC2

```bash
mkdir -p /home/ec2-user/meal-planner
cd /home/ec2-user/meal-planner

# Generate a JWT secret
JWT=$(openssl rand -hex 32)
echo "Your JWT_SECRET: $JWT"

# Generate a DB password
DBPASS=$(openssl rand -hex 16)
echo "Your DB_PASSWORD: $DBPASS"

# Create the .env file — replace <your-ec2-public-dns> with your actual DNS
cat > .env << EOF
DB_USER=mealplanner
DB_PASSWORD=$DBPASS
DB_NAME=mealplanner
JWT_SECRET=$JWT
ALLOWED_ORIGINS=http://<your-ec2-public-dns>
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=http://<your-ec2-public-dns>/api/strava/callback
EOF

# Edit to set the actual DNS
nano .env
```

---

## Step 5: Create CodeDeploy Service Role

1. Go to **IAM > Roles > Create role**
2. **Trusted entity:** AWS service → **CodeDeploy**
3. **Use case:** CodeDeploy
4. The `AWSCodeDeployRole` policy is auto-attached
5. **Name:** `CodeDeployServiceRole`

---

## Step 6: Create CodeDeploy Application

1. Go to **CodeDeploy > Applications > Create application**
   - **Name:** `meal-planner`
   - **Compute platform:** EC2/On-premises
2. Click into the application → **Create deployment group**
   - **Name:** `meal-planner-ec2`
   - **Service role:** select `CodeDeployServiceRole`
   - **Deployment type:** In-place
   - **Environment configuration:** Amazon EC2 instances
     - **Tag group:** Key = `Name`, Value = `meal-planner`
   - **Deployment settings:** `CodeDeployDefault.AllAtOnce`
   - **Load balancer:** Uncheck "Enable load balancing"

---

## Step 7: Set Up OIDC for GitHub Actions (No Long-Lived Keys)

### Create the Identity Provider

1. Go to **IAM > Identity providers > Add provider**
   - **Type:** OpenID Connect
   - **Provider URL:** `https://token.actions.githubusercontent.com` → click **Get thumbprint**
   - **Audience:** `sts.amazonaws.com`
2. Click **Add provider**

### Create the GitHub Actions Role

1. Go to **IAM > Roles > Create role**
2. **Trusted entity:** Web identity
3. **Identity provider:** `token.actions.githubusercontent.com`
4. **Audience:** `sts.amazonaws.com`
5. Skip adding policies for now → **Name:** `github-actions-deploy-role`
6. After creation, click into the role → **Trust relationships > Edit trust policy**
7. Replace with (change `<ACCOUNT_ID>` to your AWS account ID):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:samwmarsh/meal-planner:ref:refs/heads/main"
      }
    }
  }]
}
```

8. Go to **Permissions > Add permissions > Create inline policy** → JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "codedeploy:CreateDeployment",
      "codedeploy:GetDeployment",
      "codedeploy:GetDeploymentConfig",
      "codedeploy:GetApplicationRevision",
      "codedeploy:RegisterApplicationRevision"
    ],
    "Resource": "*"
  }]
}
```

9. **Copy the role ARN** (e.g. `arn:aws:iam::123456789012:role/github-actions-deploy-role`)

---

## Step 8: Add GitHub Secret

1. Go to your GitHub repo → **Settings > Secrets and variables > Actions**
2. Click **New repository secret**
   - **Name:** `AWS_DEPLOY_ROLE_ARN`
   - **Value:** the role ARN from Step 7
3. (Optional) Add a repository variable:
   - **Name:** `AWS_REGION`
   - **Value:** your AWS region (e.g. `eu-west-2`)

---

## Step 9: Clone the Repo and Set Up DB Backups

```bash
ssh -i your-key.pem ec2-user@<your-ec2-public-dns>

# Clone the repo (if .env already exists in the directory, move it out first)
cd /home/ec2-user
mv meal-planner/.env .env.backup 2>/dev/null || true
rm -rf meal-planner
git clone https://github.com/samwmarsh/meal-planner.git /home/ec2-user/meal-planner
mv .env.backup meal-planner/.env 2>/dev/null || true

# Make all deploy scripts executable
chmod +x /home/ec2-user/meal-planner/scripts/deploy/*.sh

# Set up backup cron (runs at 3am daily, keeps 7 days)
mkdir -p /home/ec2-user/backups
(crontab -l 2>/dev/null; echo '0 3 * * * /home/ec2-user/meal-planner/scripts/deploy/backup-db.sh >> /home/ec2-user/backups/cron.log 2>&1') | crontab -

# Verify
crontab -l
ls /home/ec2-user/meal-planner/scripts/deploy/
```

---

## Step 10: First Deploy

The repo was cloned in Step 9. Now build and start:

```bash
cd /home/ec2-user/meal-planner
docker compose up --build -d

# Wait for DB to become healthy and backend to start
sleep 15
curl http://localhost/api/health
# Should return: {"status":"ok","time":"..."}
```

If all is well, open your browser and go to `http://<your-ec2-public-dns>`.

From now on, every push to main will auto-deploy via CodeDeploy.

**Your app will be available at:** `http://<your-ec2-public-dns>`

---

## Troubleshooting

### CodeDeploy agent not running
```bash
sudo systemctl status codedeploy-agent
sudo systemctl restart codedeploy-agent
# Check logs:
tail -50 /var/log/aws/codedeploy-agent/codedeploy-agent.log
```

### "compose build requires buildx 0.17.0 or later"
```bash
docker buildx version
# If missing or <0.17.0, reinstall:
sudo curl -SL "https://github.com/docker/buildx/releases/download/v0.22.0/buildx-v0.22.0.linux-amd64" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
```

### Docker build fails (out of memory)
```bash
free -h  # check swap is active
# If not:
sudo swapon /swapfile
```

### Containers won't start
```bash
cd /home/ec2-user/meal-planner
docker compose logs --tail=50
docker compose ps
```

### Can't access the app from browser
- Check security group allows HTTP (80) from 0.0.0.0/0
- Check nginx is running: `docker compose ps nginx`
- Check ALLOWED_ORIGINS in .env matches your EC2 DNS exactly

### Deployment fails in GitHub Actions
- Check the CodeDeploy deployment in AWS Console → CodeDeploy → Deployments
- Each lifecycle hook has logs you can view to see what failed
