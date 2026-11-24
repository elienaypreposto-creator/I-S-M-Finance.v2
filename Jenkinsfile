// Esteira de PRODUÇÃO do ISM Finance (Jenkins da Meilock, repositório GitLab meilock/finance-ism).
// Segue o padrão dos projetos da Meilock (base-lib: commons, codedeploy, notify).
// Diferença: o projeto tem DUAS imagens (api e web) num monorepo, construídas a partir da raiz
// com Dockerfile.api e Dockerfile.web. Por isso o build é feito aqui com docker build -f.
// Detalhes e pontos a confirmar: deploy/PRODUCAO.md.

def versao_atual = ""
def versao_anterior = ""
def versao_posterior = ""

@Library("base-lib") _
pipeline {
    agent none

    options {
        disableConcurrentBuilds()
    }

    stages {
        stage('start') {
            // Só a main do GitLab vai para produção. A main recebe apenas o que já
            // passou por TST (develop) e HML (master) no GitHub.
            when {
                expression {
                    return env.BRANCH_NAME == 'main'
                }
            }
            stages {
                stage('Get and update version') {
                    agent {
                        label 'dind-agent'
                    }
                    steps {
                        script {
                            versao_atual = commons.get_versao_atual();
                            versao_anterior = commons.get_versao_anterior(versao_atual);
                            versao_posterior = commons.get_proxima_versao(versao_atual);
                        }
                    }
                }
                stage('docker build + push') {
                    agent {
                        label 'dind-agent'
                    }
                    steps {
                        script {
                            def config = readJSON file: 'jenkins-config.json'
                            def commit = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                            withCredentials([usernamePassword(credentialsId: config.registry_credentials_id,
                                    usernameVariable: 'REGISTRY_USER', passwordVariable: 'REGISTRY_PASS')]) {
                                sh """
                                    set -e
                                    echo "\$REGISTRY_PASS" | docker login registry.gitlab.com -u "\$REGISTRY_USER" --password-stdin
                                    docker build -f Dockerfile.api -t ${config.img}/api:${versao_posterior} .
                                    docker build -f Dockerfile.web \
                                        --build-arg VITE_APP_COMMIT=${commit} \
                                        --build-arg VITE_APP_BUILD=${versao_posterior} \
                                        -t ${config.img}/web:${versao_posterior} .
                                    docker push ${config.img}/api:${versao_posterior}
                                    docker push ${config.img}/web:${versao_posterior}
                                    docker logout registry.gitlab.com
                                    docker image prune -f
                                """
                            }
                        }
                    }
                }
                stage('deploy') {
                    agent {
                        label 'dind-agent'
                    }
                    steps {
                        script {
                            // Roda ansible/tasks/deploy.yml: troca a versão das duas imagens no manifesto
                            // do servidor, aplica e espera o rollout. O backup e as migrations rodam
                            // nos initContainers da API (deploy/k8s/deploy-ism-finance.yaml).
                            codedeploy.deploy(versao_posterior, versao_atual, versao_anterior)
                        }
                    }
                }
                stage('Notify Google Chat') {
                    agent {
                        label 'dind-agent'
                    }
                    steps {
                        script {
                            notify.gerarMensagem("ISM Finance", "producao", versao_anterior, versao_atual, versao_posterior)
                        }
                    }
                }
            }
        }
    }
}
